"""Renders the weekly Hebrew digest — one line counting the week's closed days and how many of
them broke a rule — and composes the question that asks the answering service for the bulleted
recap printed under it.

Every number a week produces is already in the app, so the email carries the count alone and
leaves the space to the part that asks for attention."""

import json

from common import weight
from common.chat import MAX_QUESTION_CHARS

# Names the recap wherever it surfaces: the numeric digest's heading, the email subject, and the
# title the stored chat carries in the transcript.
RECAP_TITLE = "סיכום שבועי"

_DAYS = "ימי השבוע"

# Asks for bullets rather than prose, and counts rather than dates: every date and value is in
# the app, a tap away, so spending the email's few lines re-listing them buys nothing. What the
# email is for is how many days ask for attention and why. A tracked area that stayed inside its
# range is named as good and left at that, for the same reason.
#
# The no-markup clause matters because the same answer rides an email, a Telegram message and the
# in-app chat, and none of them render markup. The plain-Hebrew clause keeps the answer in the
# questionnaire's own words: left to itself the service reached for loanwords no screen of this
# app has ever shown.
#
# Composing time tracks the words asked for and varies run to run, so the bullet count and the
# per-bullet cap are what keep the answer inside the wait the weekly job allows it.
_SUMMARY_INSTRUCTION = (
    "לפניך נתוני מעקב תזונה של משתמש מהשבוע האחרון (JSON). "
    "ענה בעברית ב-3 עד 4 תבליטים בלבד, כל תבליט משפט אחד קצר בשורה הפותחת ב-• , "
    "בלי כותרות, בלי הקדמה ובלי סימוני עיצוב, "
    "וכל תבליט נפתח בתווית קצרה ואחריה נקודתיים (למשל 'מגמה:', 'דורש תשומת לב:', 'המלצה:'): "
    "תבליט המסכם את השבוע, ובו ציין בקצרה אילו תחומים היו טובים; "
    "תבליט או שניים על מה שדורש תשומת לב — כמה ימים ומה הסיבה, "
    "בלי לפרט תאריכים ובלי לפרט ערכים של ימים בודדים; "
    "ותבליט אחד עם המלצה לשבוע הבא לפי הנחיות התזונה ומגמת המשקל מול היעד. "
    "כתוב בעברית פשוטה ובמונחים שבנתונים עצמם — שתייה, ירקות, חלון אכילה, פחמימות — "
    "בלי מילים לועזיות ובלי מונחים מקצועיים, ועד 20 מילים בתבליט. "
    "כתוב מה היה בפועל, בניסוח מלא וברור, בלי ניסוחים מעורפלים כגון 'בדרך ל'."
)


def recap_chat_title(week_start: str) -> str:
    """The title the stored recap chat carries: the recap's name and the day its week opened on,
    written the way the app writes dates. A transcript accumulates one recap a week, and the date
    is what tells them apart in the chat list."""
    year, month, day = week_start.split("-")
    return f"{RECAP_TITLE} {day}/{month}/{year}"


def _violates_any(questionnaire, answers: dict) -> bool:
    return any(
        # A day recorded before a question existed is legal and cannot violate that question's rules.
        rule.question_id in answers and rule.violates(answers[rule.question_id])
        for rule in questionnaire.rules
    )


def weekly_text(questionnaire, history: dict) -> str:
    """The week in one line: how many of its seven days were closed, and how many of those broke
    a rule — the count worth acting on, so it is the one named. A week that broke none says so
    rather than counting to zero."""
    if not history:
        return "לא נסגרו ימים השבוע"
    violating = sum(1 for answers in history.values() if _violates_any(questionnaire, answers))
    if violating == 0:
        return f"{RECAP_TITLE} — נסגרו {len(history)} מתוך 7 ימים, כולם ללא חריגה"
    return f"{RECAP_TITLE} — נסגרו {len(history)} מתוך 7 ימים, {violating} מהם עם חריגה"


def labeled_history(questionnaire, history: dict) -> dict:
    """The submitted answers keyed by date, each value under its question's Hebrew day-scope
    heading — the vocabulary the answering LLM reads instead of internal question ids."""
    return {date: {questionnaire.question(question_id).day_title: value
                   for question_id, value in answers.items()}
            for date, answers in history.items()}


def weekly_summary_question(questionnaire, history: dict, weights: dict, target) -> str:
    """The RAG question asking for a recap of the user's week plus next-week tips, grounded in the
    week's labeled data and in the latest weigh-ins beside the target — the same weight block the
    chat context sends, so both senders describe the trend in one vocabulary.

    To honor the upstream cap the oldest days go first, one at a time, and the weight block only
    once no day is left: it is small, and it is the one section a week of few closed days still
    has something to say from."""
    days = labeled_history(questionnaire, history)
    data = {_DAYS: days, weight.LABEL: weight.measurements_block(weights, target)}
    sheds = [lambda d=date: days.pop(d) for date in sorted(days)]
    sheds.append(lambda: data.pop(weight.LABEL))
    while True:
        question = f"{_SUMMARY_INSTRUCTION}\n{json.dumps(data, ensure_ascii=False)}"
        if len(question) <= MAX_QUESTION_CHARS:
            return question
        sheds.pop(0)()
