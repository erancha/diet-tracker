import json
import logging
import urllib.error

import pytest
from conftest import APP_CONFIG, FakeSes, _table

from common import chat as chat_client
from common.dates import today
from common.store import Store
from handlers import chat as chat_handler


@pytest.fixture
def env(monkeypatch, ddb):
    monkeypatch.setenv("AWS_DEFAULT_REGION", "eu-central-1")
    monkeypatch.setenv("DAYS_TABLE", "days")
    monkeypatch.setenv("MEALS_TABLE", "meals")
    monkeypatch.setenv("STATE_TABLE", "state")
    monkeypatch.setenv("WEIGHTS_TABLE", "weights")
    monkeypatch.setenv("APP_CONFIG_PATH", str(APP_CONFIG))
    _table(ddb, "chat_quota", with_sort_key=False)
    monkeypatch.setenv("CHAT_QUOTA_TABLE", "chat_quota")
    monkeypatch.setenv("CHAT_HISTORY_TABLE", "chat_history")
    monkeypatch.setenv("CHAT_DAILY_LIMIT", "2")
    monkeypatch.setenv("CHAT_DAILY_LIMIT_OVERRIDES", "{}")
    monkeypatch.setenv("RAG_API_URL", "https://rag.example/prod")
    monkeypatch.setenv("RAG_API_KEY_PARAM", "/diet-tracker/rag/api-key")
    monkeypatch.setattr(chat_handler.chat, "api_key", lambda ssm, param: "the-key")


def request(body, sub="u1", email="a@gmail.com"):
    return {
        "routeKey": "POST /chat",
        "body": json.dumps(body, ensure_ascii=False),
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": sub, "email": email}}}},
    }


def body_of(response):
    return json.loads(response["body"])


def test_returns_the_upstream_answer_and_sources(env, monkeypatch):
    asked = {}

    def fake_ask(api_url, key, question, context=None, timeout=None):
        asked.update(api_url=api_url, key=key, question=question)
        return {"answer": "תשובה מהמסמכים", "sources": [{"fileName": "מדריך.pdf", "score": 0.83}]}

    monkeypatch.setattr(chat_handler.chat, "ask", fake_ask)
    response = chat_handler.handler(request({"question": "כמה פחמימות מותר ביום?"}), None)
    assert response["statusCode"] == 200
    body = body_of(response)
    assert "T" in body.pop("at")
    assert body == {"answer": "תשובה מהמסמכים",
                    "sources": [{"fileName": "מדריך.pdf", "score": 0.83}]}
    assert asked["api_url"] == "https://rag.example/prod"
    assert asked["key"] == "the-key"
    assert asked["question"] == "כמה פחמימות מותר ביום?"


def test_the_askers_tracked_data_rides_as_context_beside_the_bare_question(env, ddb, monkeypatch):
    Store("days", "meals", "state", "weights", dynamodb=ddb).add_meal("u1", today(), {
        "at": f"{today()}T12:30:00+03:00", "carbs_choice": "carb_grade_2", "vegetables": True,
        "fruit": False, "additions": [], "portion": None, "second_source": None})
    asked = {}
    monkeypatch.setattr(chat_handler.chat, "ask", lambda api_url, key, question, context=None, timeout=None:
                        asked.update(question=question, context=context)
                        or {"answer": "ת", "sources": []})

    chat_handler.handler(request({"question": "מה אכלתי היום?"}), None)

    assert asked["question"] == "מה אכלתי היום?"
    assert "נתוני המעקב של השואל" in asked["context"]
    assert "דרגה 2" in asked["context"]


def test_the_stored_turn_keeps_the_original_question_without_the_data_block(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question, context=None, timeout=None: {"answer": "ת", "sources": []})
    chat_handler.handler(request({"question": "מה אכלתי היום?"}), None)

    (turn,) = transcript()
    assert turn["question"] == "מה אכלתי היום?"


def test_rejects_a_missing_or_blank_question(env):
    assert chat_handler.handler(request({}), None)["statusCode"] == 400
    assert chat_handler.handler(request({"question": "   "}), None)["statusCode"] == 400


def test_refuses_beyond_the_daily_limit_without_asking_upstream(env, monkeypatch):
    calls = []
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question, context=None, timeout=None: calls.append(question) or {"answer": "ת", "sources": []})
    assert chat_handler.handler(request({"question": "1"}), None)["statusCode"] == 200
    assert chat_handler.handler(request({"question": "2"}), None)["statusCode"] == 200
    refused = chat_handler.handler(request({"question": "3"}), None)
    assert refused["statusCode"] == 429
    assert len(calls) == 2


@pytest.fixture
def admin_ses(monkeypatch):
    """Fake SES capturing the admin notice. Every boto3 client resolves to the fake: besides SES
    the handler only builds the SSM client, which the stubbed chat.api_key never touches."""
    fake = FakeSes()
    monkeypatch.setattr(chat_handler.boto3, "client", lambda service: fake)
    monkeypatch.setenv("SES_SENDER", "sender@example.com")
    monkeypatch.setenv("ADMIN_EMAIL", "admin@example.com")
    return fake


def test_the_first_refused_question_emails_the_admin_once(env, admin_ses, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question, context=None, timeout=None: {"answer": "ת", "sources": []})
    assert chat_handler.handler(request({"question": "1"}), None)["statusCode"] == 200
    assert chat_handler.handler(request({"question": "2"}), None)["statusCode"] == 200
    assert admin_ses.sent == []

    assert chat_handler.handler(request({"question": "3"}), None)["statusCode"] == 429
    (mail,) = admin_ses.sent
    assert mail["Source"] == "sender@example.com"
    assert mail["Destination"] == {"ToAddresses": ["admin@example.com"]}
    assert "a@gmail.com" in mail["Message"]["Body"]["Text"]["Data"]

    assert chat_handler.handler(request({"question": "4"}), None)["statusCode"] == 429
    assert len(admin_ses.sent) == 1


def test_admin_notice_failure_is_logged_and_leaves_the_refusal_intact(env, admin_ses, monkeypatch,
                                                                      caplog):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question, context=None, timeout=None: {"answer": "ת", "sources": []})
    admin_ses.failure = RuntimeError("ses down")
    chat_handler.handler(request({"question": "1"}), None)
    chat_handler.handler(request({"question": "2"}), None)

    with caplog.at_level(logging.ERROR):
        assert chat_handler.handler(request({"question": "3"}), None)["statusCode"] == 429
    assert "a@gmail.com" in caplog.text


def test_an_override_raises_one_users_limit_and_leaves_the_rest_on_the_default(env, monkeypatch):
    monkeypatch.setenv("CHAT_DAILY_LIMIT_OVERRIDES", '{"vip@gmail.com": 4}')
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question, context=None, timeout=None: {"answer": "ת", "sources": []})

    def vip(question):
        return chat_handler.handler(request({"question": question}, sub="v1", email="VIP@gmail.com"), None)

    for question in ("1", "2", "3", "4"):
        assert vip(question)["statusCode"] == 200
    assert vip("5")["statusCode"] == 429

    assert chat_handler.handler(request({"question": "1"}), None)["statusCode"] == 200
    assert chat_handler.handler(request({"question": "2"}), None)["statusCode"] == 200
    assert chat_handler.handler(request({"question": "3"}), None)["statusCode"] == 429


def test_a_blank_question_does_not_spend_quota(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question, context=None, timeout=None: {"answer": "ת", "sources": []})
    chat_handler.handler(request({"question": "  "}), None)
    assert chat_handler.handler(request({"question": "1"}), None)["statusCode"] == 200
    assert chat_handler.handler(request({"question": "2"}), None)["statusCode"] == 200


def test_upstream_failure_maps_to_502(env, monkeypatch):
    def failing_ask(api_url, key, question, context=None, timeout=None):
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr(chat_handler.chat, "ask", failing_ask)
    assert chat_handler.handler(request({"question": "שאלה"}), None)["statusCode"] == 502


def transcript(sub="u1"):
    return body_of(chat_handler.handler({
        "routeKey": "GET /chat",
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": sub, "email": "a@gmail.com"}}}},
    }, None))["turns"]


def test_a_successful_answer_is_persisted_for_its_user(env, monkeypatch):
    sources = [{"fileName": "מדריך.pdf", "score": 0.83}]
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question, context=None, timeout=None: {"answer": "תשובה", "sources": sources})
    chat_handler.handler(request({"question": "שאלה?"}), None)

    (turn,) = transcript()
    assert turn["question"] == "שאלה?"
    assert turn["answer"] == "תשובה"
    assert turn["sources"] == sources
    assert "T" in turn["at"]
    assert transcript(sub="other") == []


def test_transcript_is_returned_newest_first(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question, context=None, timeout=None: {"answer": f"ת:{question}", "sources": []})
    chat_handler.handler(request({"question": "ראשונה"}), None)
    chat_handler.handler(request({"question": "שנייה"}), None)

    assert [turn["question"] for turn in transcript()] == ["שנייה", "ראשונה"]


def test_failed_requests_persist_no_turn(env, monkeypatch):
    def failing_ask(api_url, key, question, context=None, timeout=None):
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr(chat_handler.chat, "ask", failing_ask)
    chat_handler.handler(request({}), None)                     # 400
    chat_handler.handler(request({"question": "שאלה"}), None)   # 502

    assert transcript() == []


def test_a_follow_up_replaces_the_replied_to_turn_under_a_fresh_key(env, monkeypatch):
    answers = iter(["תשובה ראשונה", "תשובת ההמשך"])
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question, context=None, timeout=None: {"answer": next(answers), "sources": []})
    at = body_of(chat_handler.handler(request({"question": "שאלה מקורית"}), None))["at"]

    followed = chat_handler.handler(request({"question": "שרשור עם שאלת המשך", "at": at}), None)

    assert followed["statusCode"] == 200
    followed_at = body_of(followed)["at"]
    assert followed_at > at
    (turn,) = transcript()
    assert turn["question"] == "שרשור עם שאלת המשך"
    assert turn["answer"] == "תשובת ההמשך"
    assert turn["at"] == followed_at


def test_a_question_the_app_composed_is_stored_marked_and_a_typed_one_is_not(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question, context=None, timeout=None: {"answer": "ת", "sources": []})

    chat_handler.handler(request({"question": "איך מאשרים את כתובת המייל?", "app": True}), None)
    chat_handler.handler(request({"question": "שאלה שהקלדתי"}), None)

    marks = {turn["question"]: turn["app"] for turn in transcript()}
    assert marks == {"איך מאשרים את כתובת המייל?": True, "שאלה שהקלדתי": False}


def test_a_follow_up_can_carry_the_apps_mark_across_to_the_replacing_chat(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question, context=None, timeout=None: {"answer": "ת", "sources": []})
    at = body_of(chat_handler.handler(request({"question": "שאלת האפליקציה", "app": True}), None))["at"]

    chat_handler.handler(request({"question": "שרשור", "at": at, "app": True}), None)

    (turn,) = transcript()
    assert turn["app"] is True


def test_a_non_boolean_app_mark_is_400_and_spends_no_quota(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question, context=None, timeout=None: {"answer": "ת", "sources": []})
    assert chat_handler.handler(request({"question": "שאלה", "app": "yes"}), None)["statusCode"] == 400

    assert chat_handler.handler(request({"question": "1"}), None)["statusCode"] == 200
    assert chat_handler.handler(request({"question": "2"}), None)["statusCode"] == 200


def test_a_follow_up_to_a_missing_turn_is_404_and_persists_nothing(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question, context=None, timeout=None: {"answer": "ת", "sources": []})

    response = chat_handler.handler(
        request({"question": "שאלת המשך", "at": "2026-09-01T10:00:00+00:00"}), None)

    assert response["statusCode"] == 404
    assert transcript() == []


def test_a_follow_up_with_a_malformed_at_is_400_and_spends_no_quota(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question, context=None, timeout=None: {"answer": "ת", "sources": []})
    assert chat_handler.handler(request({"question": "שאלה", "at": "  "}), None)["statusCode"] == 400
    assert chat_handler.handler(request({"question": "שאלה", "at": 5}), None)["statusCode"] == 400

    assert chat_handler.handler(request({"question": "1"}), None)["statusCode"] == 200
    assert chat_handler.handler(request({"question": "2"}), None)["statusCode"] == 200


def delete_request(at, sub="u1"):
    return {
        "routeKey": "DELETE /chat/{at}",
        "pathParameters": {"at": at},
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": sub, "email": "a@gmail.com"}}}},
    }


def test_a_turn_can_be_deleted_by_its_timestamp(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question, context=None, timeout=None: {"answer": "ת", "sources": []})
    at = body_of(chat_handler.handler(request({"question": "שאלה?"}), None))["at"]

    response = chat_handler.handler(delete_request(at), None)
    assert response["statusCode"] == 200
    assert transcript() == []


def test_deleting_a_missing_turn_is_404(env):
    assert chat_handler.handler(delete_request("2026-09-01T10:00:00+00:00"), None)["statusCode"] == 404


def test_a_user_cannot_delete_another_users_turn(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question, context=None, timeout=None: {"answer": "ת", "sources": []})
    at = body_of(chat_handler.handler(request({"question": "שאלה?"}), None))["at"]

    assert chat_handler.handler(delete_request(at, sub="other"), None)["statusCode"] == 404
    assert len(transcript()) == 1


def test_ask_posts_the_question_with_the_api_key(monkeypatch):
    captured = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return json.dumps({"answer": "ת", "sources": []}).encode()

    def fake_urlopen(request_object, timeout):
        captured["url"] = request_object.full_url
        captured["api_key"] = request_object.get_header("X-api-key")
        captured["payload"] = json.loads(request_object.data)
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(chat_client.urllib.request, "urlopen", fake_urlopen)
    result = chat_client.ask("https://rag.example/prod", "the-key", "שאלה")
    assert result == {"answer": "ת", "sources": []}
    assert captured["url"] == "https://rag.example/prod/rag/query"
    assert captured["api_key"] == "the-key"
    assert captured["payload"] == {"question": "שאלה"}
    assert captured["timeout"] == chat_client.TIMEOUT_SECONDS

    chat_client.ask("https://rag.example/prod", "the-key", "שאלה", context="נתוני המעקב")
    assert captured["payload"] == {"question": "שאלה", "context": "נתוני המעקב"}


def test_document_url_posts_the_file_name_with_the_api_key(monkeypatch):
    captured = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return json.dumps({"url": "https://bucket.s3/doc.pdf?sig"}).encode()

    def fake_urlopen(request_object, timeout):
        captured["url"] = request_object.full_url
        captured["api_key"] = request_object.get_header("X-api-key")
        captured["payload"] = json.loads(request_object.data)
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(chat_client.urllib.request, "urlopen", fake_urlopen)
    url = chat_client.document_url("https://rag.example/prod", "the-key", "מדריך.pdf")
    assert url == "https://bucket.s3/doc.pdf?sig"
    assert captured["url"] == "https://rag.example/prod/rag/document-url"
    assert captured["api_key"] == "the-key"
    assert captured["payload"] == {"fileName": "מדריך.pdf"}
    assert captured["timeout"] == chat_client.TIMEOUT_SECONDS


def test_document_url_reports_a_document_the_service_does_not_hold(monkeypatch):
    def fake_urlopen(request_object, timeout):
        raise urllib.error.HTTPError(request_object.full_url, 404, "Not Found", {}, None)

    monkeypatch.setattr(chat_client.urllib.request, "urlopen", fake_urlopen)
    with pytest.raises(chat_client.DocumentNotFound):
        chat_client.document_url("https://rag.example/prod", "the-key", "אין.pdf")


def source_url_request(body, sub="u1", email="a@gmail.com"):
    return {**request(body, sub, email), "routeKey": "POST /chat/source-url"}


def test_a_source_url_is_fetched_upstream_and_returned_without_spending_quota(env, ddb, monkeypatch):
    fetched = {}
    monkeypatch.setattr(chat_handler.chat, "document_url", lambda api_url, key, file_name:
                        fetched.update(api_url=api_url, key=key, file_name=file_name)
                        or "https://bucket.s3/doc.pdf?sig")
    response = chat_handler.handler(source_url_request({"fileName": "מדריך.pdf"}), None)
    assert response["statusCode"] == 200
    assert body_of(response) == {"url": "https://bucket.s3/doc.pdf?sig"}
    assert fetched == {"api_url": "https://rag.example/prod", "key": "the-key",
                       "file_name": "מדריך.pdf"}
    assert ddb.Table("chat_quota").scan()["Items"] == []


def test_a_source_url_for_an_unknown_document_is_404(env, monkeypatch):
    def missing(api_url, key, file_name):
        raise chat_client.DocumentNotFound(file_name)

    monkeypatch.setattr(chat_handler.chat, "document_url", missing)
    response = chat_handler.handler(source_url_request({"fileName": "אין.pdf"}), None)
    assert response["statusCode"] == 404
    assert body_of(response) == {"error": "המסמך אינו זמין"}


def test_a_source_url_request_without_a_file_name_is_400(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "document_url",
                        lambda *args: pytest.fail("must not reach upstream"))
    for body in ({}, {"fileName": "  "}, {"fileName": 3}):
        assert chat_handler.handler(source_url_request(body), None)["statusCode"] == 400


def test_a_source_url_upstream_failure_maps_to_502(env, monkeypatch):
    def down(api_url, key, file_name):
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr(chat_handler.chat, "document_url", down)
    assert chat_handler.handler(source_url_request({"fileName": "מדריך.pdf"}), None)["statusCode"] == 502


def summary_request(at, sub="u1", email="a@gmail.com"):
    return {
        "routeKey": "POST /chat/{at}/summary",
        "pathParameters": {"at": at},
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": sub, "email": email}}}},
    }


def stored_chat(monkeypatch, question="שאלה מקורית", answer="תשובה", sources=None):
    """Answers one question and returns the stamp its stored chat is keyed by."""
    monkeypatch.setattr(chat_handler.chat, "ask", lambda api_url, key, question, context=None, timeout=None:
                        {"answer": answer, "sources": sources or []})
    return body_of(chat_handler.handler(request({"question": question}), None))["at"]


def test_a_summary_replaces_the_chat_with_its_original_question_and_the_digest(env, monkeypatch):
    at = stored_chat(monkeypatch,
                     question="השאלה המקורית: מה מותר?\nהתשובה: הרבה\nשאלת המשך: ולמה?",
                     answer="כי כך", sources=[{"fileName": "מדריך.pdf", "score": 0.9}])
    monkeypatch.setattr(chat_handler.chat, "ask", lambda api_url, key, question, context=None, timeout=None:
                        {"answer": "השיחה עסקה במה שמותר לאכול", "sources": [{"fileName": "א.pdf", "score": 0.4}]})

    response = chat_handler.handler(summary_request(at), None)

    assert response["statusCode"] == 200
    assert body_of(response) == {"question": "מה מותר?", "answer": "השיחה עסקה במה שמותר לאכול",
                                 "sources": [], "summarized": True, "app": False, "at": at}
    (turn,) = transcript()
    assert turn == {"question": "מה מותר?", "answer": "השיחה עסקה במה שמותר לאכול",
                    "sources": [], "summarized": True, "app": False, "at": at}


def test_a_summary_keeps_every_line_of_a_multi_line_original_question(env, monkeypatch):
    at = stored_chat(monkeypatch,
                     question="השאלה המקורית: אכלתי מאוחר\nוגם שתיתי יין. מה עכשיו?\n"
                              "התשובה: לחכות\nשאלת המשך: כמה זמן?",
                     answer="14 שעות")
    monkeypatch.setattr(chat_handler.chat, "ask", lambda api_url, key, question, context=None, timeout=None:
                        {"answer": "סיכום", "sources": []})

    chat_handler.handler(summary_request(at), None)

    (turn,) = transcript()
    assert turn["question"] == "אכלתי מאוחר\nוגם שתיתי יין. מה עכשיו?"


def test_a_summary_sends_the_labeled_conversation_upstream_as_context(env, monkeypatch):
    at = stored_chat(monkeypatch, question="כמה חלבון?", answer="1.5 גרם לקילו")
    asked = {}
    monkeypatch.setattr(chat_handler.chat, "ask", lambda api_url, key, question, context=None, timeout=None:
                        asked.update(question=question, context=context)
                        or {"answer": "סיכום", "sources": []})

    chat_handler.handler(summary_request(at), None)

    assert asked["question"] == chat_handler.SUMMARY_INSTRUCTION
    assert asked["context"] == "השאלה המקורית: כמה חלבון?\nהתשובה: 1.5 גרם לקילו"


def test_a_summary_beyond_the_daily_limit_is_refused_without_asking_upstream(env, monkeypatch):
    at = stored_chat(monkeypatch, question="1")
    assert chat_handler.handler(request({"question": "2"}), None)["statusCode"] == 200
    calls = []
    monkeypatch.setattr(chat_handler.chat, "ask", lambda api_url, key, question, context=None, timeout=None:
                        calls.append(question) or {"answer": "סיכום", "sources": []})

    refused = chat_handler.handler(summary_request(at), None)

    assert refused["statusCode"] == 429
    assert calls == []
    assert transcript()[-1]["question"] == "1"


def test_summarizing_a_missing_chat_is_404_and_spends_no_quota(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask", lambda api_url, key, question, context=None, timeout=None:
                        {"answer": "ת", "sources": []})

    assert chat_handler.handler(summary_request("2026-09-01T10:00:00+00:00"), None)["statusCode"] == 404

    assert chat_handler.handler(request({"question": "1"}), None)["statusCode"] == 200
    assert chat_handler.handler(request({"question": "2"}), None)["statusCode"] == 200


def test_a_user_cannot_summarize_another_users_chat(env, monkeypatch):
    at = stored_chat(monkeypatch)

    assert chat_handler.handler(summary_request(at, sub="other"), None)["statusCode"] == 404
    assert transcript()[0]["question"] == "שאלה מקורית"


def test_an_upstream_failure_leaves_the_chat_unsummarized(env, monkeypatch):
    at = stored_chat(monkeypatch, question="שאלה מקורית", answer="תשובה")

    def failing_ask(api_url, key, question, context=None, timeout=None):
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr(chat_handler.chat, "ask", failing_ask)
    assert chat_handler.handler(summary_request(at), None)["statusCode"] == 502

    (turn,) = transcript()
    assert turn["question"] == "שאלה מקורית"
    assert turn["answer"] == "תשובה"


def unreachable(*args, **kwargs):
    raise AssertionError("the answering service must not be called when none is configured")


def test_an_unconfigured_service_refuses_a_question_before_spending_quota(env, ddb, monkeypatch):
    monkeypatch.setenv("RAG_API_URL", "")
    monkeypatch.setattr(chat_handler.chat, "ask", unreachable)
    response = chat_handler.handler(request({"question": "כמה פחמימות מותר ביום?"}), None)
    assert response["statusCode"] == 503
    assert ddb.Table("chat_quota").scan()["Items"] == []


def test_an_unconfigured_service_refuses_a_summary_before_spending_quota(env, ddb, monkeypatch):
    at = stored_chat(monkeypatch)
    # Storing the chat spent a question of its own; the day starts clean so what the refused
    # summary leaves behind is the whole of what the table holds.
    ddb.Table("chat_quota").delete_item(Key={"pk": f"u1#{today()}"})
    monkeypatch.setenv("RAG_API_URL", "")
    monkeypatch.setattr(chat_handler.chat, "ask", unreachable)
    assert chat_handler.handler(summary_request(at), None)["statusCode"] == 503
    assert ddb.Table("chat_quota").scan()["Items"] == []


def test_an_unconfigured_service_refuses_a_source_url(env, monkeypatch):
    monkeypatch.setenv("RAG_API_URL", "")
    monkeypatch.setattr(chat_handler.chat, "document_url", unreachable)
    assert chat_handler.handler(source_url_request({"fileName": "מדריך.pdf"}), None)["statusCode"] == 503


def test_an_unconfigured_service_still_serves_and_deletes_the_stored_transcript(env, monkeypatch):
    at = stored_chat(monkeypatch, question="שאלה מקורית")
    monkeypatch.setenv("RAG_API_URL", "")
    assert [turn["question"] for turn in transcript()] == ["שאלה מקורית"]
    assert chat_handler.handler(delete_request(at), None)["statusCode"] == 200
    assert transcript() == []
