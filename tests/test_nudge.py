import dataclasses
from pathlib import Path

import pytest

from common.dates import days_before, today
from common.questionnaire import load
from common.users import User
from handlers import nudge

CONFIG = Path(__file__).parent.parent / "config" / "questionnaire.json"
VIOLATING = {
    "drinking": "l3", "vegetables": "meals2", "eating_window": "over_12",
    "meals": "m3", "carbs": "grade3",
}
CLEAN = {
    "drinking": "l3", "vegetables": "meals2", "eating_window": "h10",
    "meals": "m3", "carbs": "grade3",
}


class FakeStore:
    def __init__(self):
        self.answers = {}   # (sub, day) -> answers
        self.state = {}     # sub -> nudge state

    def has_answers(self, sub, day): return (sub, day) in self.answers
    def put_answers(self, sub, day, answers, version, submitted_at): self.answers[(sub, day)] = answers
    def get_answers_range(self, sub, start, end):
        return {day: a for (s, day), a in self.answers.items() if s == sub and start <= day <= end}
    def get_nudge_state(self, sub): return self.state.get(sub, {"rules": {}})
    def put_nudge_state(self, sub, state): self.state[sub] = state


@pytest.fixture
def env(monkeypatch):
    sent = []
    monkeypatch.setattr(nudge.notify, "send_telegram", lambda token, chat, text: sent.append(("tg", chat, text)))
    monkeypatch.setattr(nudge.notify, "send_email", lambda ses, sender, to, subject, body: sent.append(("mail", to, body)))
    e = nudge.NudgeEnv(
        store=FakeStore(), questionnaire=load(CONFIG),
        users=[User("u1", "a@gmail.com"), User("u2", "b@gmail.com")],
        telegram=("TOKEN", {"a@gmail.com": "111", "b@gmail.com": "222"}),
        ses=None, sender="me@x.com",
    )
    return e, sent


def test_reminder_targets_only_users_missing_today(env):
    e, sent = env
    e.store.put_answers("u1", today(), CLEAN, 1, "t")
    nudge._reminder(e)
    assert [(kind, target) for kind, target, _ in sent] == [("tg", "222"), ("mail", "b@gmail.com")]


def test_reminder_sends_only_email_when_telegram_disabled(env):
    e, sent = env
    e = dataclasses.replace(e, telegram=None)
    nudge._reminder(e)
    assert [kind for kind, _, _ in sent] == ["mail", "mail"]


def test_rules_job_alerts_on_streak_and_dedups(env):
    e, sent = env
    for offset in (2, 1, 0):
        e.store.put_answers("u1", days_before(today(), offset), VIOLATING, 1, "t")
    nudge._rules_job(e)
    assert {target for _, target, _ in sent} == {"111", "a@gmail.com"}
    sent.clear()
    nudge._rules_job(e)
    assert sent == []


def test_rules_job_evaluates_as_of_latest_submitted_day(env):
    e, sent = env
    # Streak completed yesterday; today unsubmitted. The nightly job must still catch it.
    for offset in (3, 2, 1):
        e.store.put_answers("u1", days_before(today(), offset), VIOLATING, 1, "t")
    nudge._rules_job(e)
    assert any("חלון אכילה" in text for _, _, text in sent)


def test_weekly_sends_digest_to_every_user(env):
    e, sent = env
    e.store.put_answers("u1", today(), CLEAN, 1, "t")
    nudge._weekly(e)
    targets = [target for _, target, _ in sent]
    assert targets == ["111", "a@gmail.com", "222", "b@gmail.com"]
    assert any("סיכום שבועי" in text for _, _, text in sent)
    assert any("לא מולאו שאלונים השבוע" in text for _, _, text in sent)
