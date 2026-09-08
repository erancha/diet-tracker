import json
import logging

import boto3
import pytest
from moto import mock_aws

from common import notify, rules


def test_violation_text_leads_the_bullets_with_a_header():
    violations = [
        rules.Violation("drinking", 2, "פחות מ-2.5 ליטר שתיה 2 ימים ברצף"),
        rules.Violation("carbs", 3, "ציון יומי 12 ומעלה 3 ימים ברצף"),
    ]
    assert notify.violation_text(violations) == (
        "התראות תזונה:\n"
        "• פחות מ-2.5 ליטר שתיה 2 ימים ברצף\n"
        "• ציון יומי 12 ומעלה 3 ימים ברצף"
    )


def test_send_email_via_ses():
    with mock_aws():
        ses = boto3.client("ses", region_name="eu-central-1")
        ses.verify_email_identity(EmailAddress="me@example.com")
        notify.send_email(ses, "me@example.com", "me@example.com", "נושא", "גוף ההודעה",
                          "https://dxyz.cloudfront.net")
        assert ses.get_send_quota()["SentLast24Hours"] == 1


def test_send_email_closes_with_mute_footnote_and_app_link():
    captured = {}

    class FakeSes:
        def send_email(self, **kwargs):
            captured.update(kwargs)

    notify.send_email(FakeSes(), "me@x.com", "you@x.com", "נושא", "גוף ההודעה",
                      "https://dxyz.cloudfront.net")
    body = captured["Message"]["Body"]["Text"]["Data"]
    assert body.startswith("גוף ההודעה\n\n")
    assert "ביטול התראות" in body
    assert body.endswith("https://dxyz.cloudfront.net")


def test_send_plain_email_sends_the_body_verbatim():
    captured = {}

    class FakeSes:
        def send_email(self, **kwargs):
            captured.update(kwargs)

    notify.send_plain_email(FakeSes(), "me@x.com", "you@x.com", "נושא", "גוף ההודעה")
    assert captured["Source"] == "me@x.com"
    assert captured["Destination"] == {"ToAddresses": ["you@x.com"]}
    assert captured["Message"]["Subject"]["Data"] == "נושא"
    assert captured["Message"]["Body"]["Text"]["Data"] == "גוף ההודעה"


def test_every_email_carries_a_right_to_left_html_body_beside_its_text():
    # Hebrew read as a text-only mail leaves direction to the client, which guesses per line and
    # strands a trailing colon on the wrong edge. Both parts ride, so a client refusing HTML still
    # gets the message.
    captured = {}

    class FakeSes:
        def send_email(self, **kwargs):
            captured.update(kwargs)

    notify.send_plain_email(FakeSes(), "me@x.com", "you@x.com", "נושא", "שורה\nשורה שנייה")
    html = captured["Message"]["Body"]["Html"]["Data"]
    assert 'dir="rtl"' in html
    assert "<strong>שורה</strong><br>שורה שנייה" in html
    assert captured["Message"]["Body"]["Text"]["Data"] == "שורה\nשורה שנייה"


def test_html_body_sets_the_opening_line_and_each_bullet_label_in_bold():
    # The two things a reader should catch first: what the week came to, and what each bullet is
    # about. The plain-text part carries neither mark, so Telegram is unaffected.
    body = "סיכום שבועי — 5 מהם עם חריגה\n\n• מגמה: שתייה טובה\n• דורש תשומת לב: 4 ימים"
    html = notify.rtl_html(body)
    assert "<strong>סיכום שבועי — 5 מהם עם חריגה</strong>" in html
    assert "<strong>• מגמה:</strong> שתייה טובה" in html
    assert "<strong>• דורש תשומת לב:</strong> 4 ימים" in html


def test_a_bullet_without_a_label_is_left_unbolded():
    # The label is bounded, so a colon deep in a sentence — or a clock time — cannot bold a line
    # that was never labelled.
    html = notify.rtl_html("שורה ראשונה\n• משפט ארוך בלי תווית שמסתיים כאן ואז מופיע 07:20 בתוכו")
    assert html.count("<strong>") == 1


def test_html_body_escapes_the_text_it_renders():
    # The body carries answering-service prose; a stray angle bracket must draw as itself rather
    # than open a tag, in the mail and in the app that shows a refused one.
    assert "&lt;b&gt;" in notify.rtl_html("<b>")
    assert "<b>" not in notify.rtl_html("<b>")


def test_send_telegram_posts_message(monkeypatch):
    captured = {}

    class FakeResponse:
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self): return json.dumps({"ok": True}).encode()

    def fake_urlopen(request):
        captured["url"] = request.full_url
        captured["body"] = json.loads(request.data)
        return FakeResponse()

    monkeypatch.setattr(notify.urllib.request, "urlopen", fake_urlopen)
    notify.send_telegram("TOKEN", "12345", "שלום")
    assert captured["url"] == "https://api.telegram.org/botTOKEN/sendMessage"
    assert captured["body"] == {"chat_id": "12345", "text": "שלום"}


def test_send_email_logs_delivery_receipt(caplog):
    with mock_aws():
        ses = boto3.client("ses", region_name="eu-central-1")
        ses.verify_email_identity(EmailAddress="me@example.com")
        with caplog.at_level(logging.INFO):
            notify.send_email(ses, "me@example.com", "you@example.com", "נושא", "גוף",
                              "https://dxyz.cloudfront.net")
    assert "email sent" in caplog.text
    assert "you@example.com" in caplog.text


def test_send_telegram_logs_delivery_receipt(monkeypatch, caplog):
    class FakeResponse:
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self): return json.dumps({"ok": True}).encode()

    monkeypatch.setattr(notify.urllib.request, "urlopen", lambda request: FakeResponse())
    with caplog.at_level(logging.INFO):
        notify.send_telegram("TOKEN", "12345", "שלום")
    assert "telegram sent" in caplog.text
    assert "12345" in caplog.text


def test_send_telegram_raises_on_api_failure(monkeypatch):
    class FakeResponse:
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self): return json.dumps({"ok": False, "description": "bad chat"}).encode()

    monkeypatch.setattr(notify.urllib.request, "urlopen", lambda request: FakeResponse())
    with pytest.raises(RuntimeError):
        notify.send_telegram("TOKEN", "12345", "שלום")


def test_telegram_config_returns_none_when_token_absent():
    with mock_aws():
        ssm = boto3.client("ssm", region_name="eu-central-1")
        assert notify.telegram_config(ssm, "/diet-tracker/telegram/bot-token", "/diet-tracker/telegram/chat-map") is None


def test_telegram_config_returns_token_and_chat_map_when_both_present():
    with mock_aws():
        ssm = boto3.client("ssm", region_name="eu-central-1")
        ssm.put_parameter(Name="/diet-tracker/telegram/bot-token", Type="SecureString", Value="TOKEN")
        ssm.put_parameter(Name="/diet-tracker/telegram/chat-map", Type="SecureString",
                          Value='{"a@gmail.com": "111"}')
        result = notify.telegram_config(ssm, "/diet-tracker/telegram/bot-token", "/diet-tracker/telegram/chat-map")
        assert result == ("TOKEN", {"a@gmail.com": "111"})


def test_telegram_config_raises_when_token_present_but_chat_map_missing():
    with mock_aws():
        ssm = boto3.client("ssm", region_name="eu-central-1")
        ssm.put_parameter(Name="/diet-tracker/telegram/bot-token", Type="SecureString", Value="TOKEN")
        with pytest.raises(ssm.exceptions.ParameterNotFound):
            notify.telegram_config(ssm, "/diet-tracker/telegram/bot-token", "/diet-tracker/telegram/chat-map")
