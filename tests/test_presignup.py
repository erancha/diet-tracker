import pytest

from handlers import presignup


def event(email):
    return {"request": {"userAttributes": {"email": email}}, "response": {}}


def test_allowed_email_passes(monkeypatch):
    monkeypatch.setenv("ALLOWED_EMAILS", "a@gmail.com, B@Gmail.com")
    assert presignup.handler(event("A@gmail.com"), None) == event("A@gmail.com")
    assert presignup.handler(event("b@gmail.com"), None) == event("b@gmail.com")


def test_unknown_email_rejected(monkeypatch):
    monkeypatch.setenv("ALLOWED_EMAILS", "a@gmail.com")
    with pytest.raises(PermissionError):
        presignup.handler(event("intruder@gmail.com"), None)
