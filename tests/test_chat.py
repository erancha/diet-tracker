import json
import urllib.error

import pytest

from common import chat as chat_client
from handlers import chat as chat_handler


@pytest.fixture
def env(monkeypatch, ddb):
    monkeypatch.setenv("AWS_DEFAULT_REGION", "eu-central-1")
    ddb.create_table(TableName="chat_quota",
                     KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
                     AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}],
                     BillingMode="PAY_PER_REQUEST")
    ddb.create_table(TableName="chat_history",
                     KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"},
                                {"AttributeName": "sk", "KeyType": "RANGE"}],
                     AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"},
                                           {"AttributeName": "sk", "AttributeType": "S"}],
                     BillingMode="PAY_PER_REQUEST")
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

    def fake_ask(api_url, key, question):
        asked.update(api_url=api_url, key=key, question=question)
        return {"answer": "תשובה מהמסמכים", "sources": [{"fileName": "מדריך.pdf", "score": 0.83}]}

    monkeypatch.setattr(chat_handler.chat, "ask", fake_ask)
    response = chat_handler.handler(request({"question": "כמה פחמימות מותר ביום?"}), None)
    assert response["statusCode"] == 200
    body = body_of(response)
    assert "T" in body.pop("at")
    assert body == {"answer": "תשובה מהמסמכים",
                    "sources": [{"fileName": "מדריך.pdf", "score": 0.83}]}
    assert asked == {"api_url": "https://rag.example/prod", "key": "the-key",
                     "question": "כמה פחמימות מותר ביום?"}


def test_rejects_a_missing_or_blank_question(env):
    assert chat_handler.handler(request({}), None)["statusCode"] == 400
    assert chat_handler.handler(request({"question": "   "}), None)["statusCode"] == 400


def test_refuses_beyond_the_daily_limit_without_asking_upstream(env, monkeypatch):
    calls = []
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question: calls.append(question) or {"answer": "ת", "sources": []})
    assert chat_handler.handler(request({"question": "1"}), None)["statusCode"] == 200
    assert chat_handler.handler(request({"question": "2"}), None)["statusCode"] == 200
    refused = chat_handler.handler(request({"question": "3"}), None)
    assert refused["statusCode"] == 429
    assert len(calls) == 2


def test_an_override_raises_one_users_limit_and_leaves_the_rest_on_the_default(env, monkeypatch):
    monkeypatch.setenv("CHAT_DAILY_LIMIT_OVERRIDES", '{"vip@gmail.com": 4}')
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question: {"answer": "ת", "sources": []})

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
                        lambda api_url, key, question: {"answer": "ת", "sources": []})
    chat_handler.handler(request({"question": "  "}), None)
    assert chat_handler.handler(request({"question": "1"}), None)["statusCode"] == 200
    assert chat_handler.handler(request({"question": "2"}), None)["statusCode"] == 200


def test_upstream_failure_maps_to_502(env, monkeypatch):
    def failing_ask(api_url, key, question):
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
                        lambda api_url, key, question: {"answer": "תשובה", "sources": sources})
    chat_handler.handler(request({"question": "שאלה?"}), None)

    (turn,) = transcript()
    assert turn["question"] == "שאלה?"
    assert turn["answer"] == "תשובה"
    assert turn["sources"] == sources
    assert "T" in turn["at"]
    assert transcript(sub="other") == []


def test_transcript_is_returned_newest_first(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question: {"answer": f"ת:{question}", "sources": []})
    chat_handler.handler(request({"question": "ראשונה"}), None)
    chat_handler.handler(request({"question": "שנייה"}), None)

    assert [turn["question"] for turn in transcript()] == ["שנייה", "ראשונה"]


def test_failed_requests_persist_no_turn(env, monkeypatch):
    def failing_ask(api_url, key, question):
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr(chat_handler.chat, "ask", failing_ask)
    chat_handler.handler(request({}), None)                     # 400
    chat_handler.handler(request({"question": "שאלה"}), None)   # 502

    assert transcript() == []


def test_a_follow_up_overwrites_the_replied_to_turn_in_place(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question: {"answer": f"ת:{question}", "sources": []})
    at = body_of(chat_handler.handler(request({"question": "שאלה מקורית"}), None))["at"]

    followed = chat_handler.handler(request({"question": "שרשור עם שאלת המשך", "at": at}), None)

    assert followed["statusCode"] == 200
    assert body_of(followed)["at"] == at
    (turn,) = transcript()
    assert turn["question"] == "שרשור עם שאלת המשך"
    assert turn["answer"] == "ת:שרשור עם שאלת המשך"
    assert turn["at"] == at


def test_a_follow_up_to_a_missing_turn_is_404_and_persists_nothing(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question: {"answer": "ת", "sources": []})

    response = chat_handler.handler(
        request({"question": "שאלת המשך", "at": "2026-09-01T10:00:00+00:00"}), None)

    assert response["statusCode"] == 404
    assert transcript() == []


def test_a_follow_up_with_a_malformed_at_is_400_and_spends_no_quota(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question: {"answer": "ת", "sources": []})
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
                        lambda api_url, key, question: {"answer": "ת", "sources": []})
    at = body_of(chat_handler.handler(request({"question": "שאלה?"}), None))["at"]

    response = chat_handler.handler(delete_request(at), None)
    assert response["statusCode"] == 200
    assert transcript() == []


def test_deleting_a_missing_turn_is_404(env):
    assert chat_handler.handler(delete_request("2026-09-01T10:00:00+00:00"), None)["statusCode"] == 404


def test_a_user_cannot_delete_another_users_turn(env, monkeypatch):
    monkeypatch.setattr(chat_handler.chat, "ask",
                        lambda api_url, key, question: {"answer": "ת", "sources": []})
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
