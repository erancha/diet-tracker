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
    monkeypatch.setenv("CHAT_QUOTA_TABLE", "chat_quota")
    monkeypatch.setenv("CHAT_DAILY_LIMIT", "2")
    monkeypatch.setenv("RAG_API_URL", "https://rag.example/prod")
    monkeypatch.setenv("RAG_API_KEY_PARAM", "/diet-tracker/rag/api-key")
    monkeypatch.setattr(chat_handler.chat, "api_key", lambda ssm, param: "the-key")


def request(body):
    return {
        "routeKey": "POST /chat",
        "body": json.dumps(body, ensure_ascii=False),
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "u1", "email": "a@gmail.com"}}}},
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
    assert body_of(response) == {"answer": "תשובה מהמסמכים",
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
