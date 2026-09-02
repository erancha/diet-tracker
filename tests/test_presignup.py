import logging

import pytest

from handlers import presignup


def event(email):
    return {"request": {"userAttributes": {"email": email}}, "response": {}}


class FakeSes:
    """Records send_email calls; raises instead when primed with a failure."""

    def __init__(self, failure=None):
        self.sent = []
        self.failure = failure

    def send_email(self, **kwargs):
        if self.failure is not None:
            raise self.failure
        self.sent.append(kwargs)


@pytest.fixture
def ses(monkeypatch):
    fake = FakeSes()
    monkeypatch.setattr(presignup.boto3, "client", lambda service: fake)
    monkeypatch.setenv("SES_SENDER", "sender@example.com")
    monkeypatch.setenv("ADMIN_EMAIL", "admin@example.com")
    return fake


def test_alternation_admits_each_listed_email(ses, monkeypatch):
    monkeypatch.setenv("ALLOWED_EMAILS", r"a@gmail\.com|B@Gmail\.com")
    assert presignup.handler(event("A@gmail.com"), None) == event("A@gmail.com")
    assert presignup.handler(event("b@gmail.com"), None) == event("b@gmail.com")


def test_unknown_email_rejected(ses, monkeypatch):
    monkeypatch.setenv("ALLOWED_EMAILS", "a@gmail.com")
    with pytest.raises(PermissionError):
        presignup.handler(event("intruder@gmail.com"), None)
    assert ses.sent == []


def test_pattern_containing_comma_quantifier_stays_intact(ses, monkeypatch):
    monkeypatch.setenv("ALLOWED_EMAILS", r"user\d{2,3}@gmail\.com")
    assert presignup.handler(event("user18@gmail.com"), None) == event("user18@gmail.com")
    with pytest.raises(PermissionError):
        presignup.handler(event("user1@gmail.com"), None)


def test_regex_admits_matching_emails_only(ses, monkeypatch):
    monkeypatch.setenv("ALLOWED_EMAILS", r".*@gmail\.com")
    assert presignup.handler(event("anyone@gmail.com"), None) == event("anyone@gmail.com")
    with pytest.raises(PermissionError):
        presignup.handler(event("anyone@evil.com"), None)


def test_allow_all_pattern_admits_any_email(ses, monkeypatch):
    monkeypatch.setenv("ALLOWED_EMAILS", ".*")
    assert presignup.handler(event("stranger@anywhere.org"), None) == event("stranger@anywhere.org")


def test_admin_notified_of_each_new_user(ses, monkeypatch):
    monkeypatch.setenv("ALLOWED_EMAILS", ".*")
    presignup.handler(event("newcomer@gmail.com"), None)
    assert len(ses.sent) == 1
    mail = ses.sent[0]
    assert mail["Source"] == "sender@example.com"
    assert mail["Destination"] == {"ToAddresses": ["admin@example.com"]}
    assert "newcomer@gmail.com" in mail["Message"]["Body"]["Text"]["Data"]


def test_notification_failure_is_logged_and_does_not_block_signup(ses, monkeypatch, caplog):
    monkeypatch.setenv("ALLOWED_EMAILS", ".*")
    ses.failure = RuntimeError("ses down")
    with caplog.at_level(logging.ERROR):
        assert presignup.handler(event("newcomer@gmail.com"), None) == event("newcomer@gmail.com")
    assert "newcomer@gmail.com" in caplog.text
