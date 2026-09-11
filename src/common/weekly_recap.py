"""Renders the weekly Hebrew recap: one line counting the week's closed days and how many of them
broke a rule, and the request that asks the answering service for the bulleted advice printed under
that line — a question naming the subjects the advice may speak about, and a context block carrying
how to answer and the week itself.

Every number a week produces is already in the app, so the email carries the count alone and
leaves the space to the part that asks for attention."""

import json

from common import weight
from common.chat import MAX_CONTEXT_CHARS

# Names the recap wherever it surfaces: the numeric line's heading, the email subject, and the
# title the stored chat carries in the transcript.
TITLE = "סיכום שבועי"

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
INSTRUCTION = (
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


# The only field the service embeds to choose which program documents ground the recap, so it names
# the subjects a weekly recap may speak about. The same text every week: a clean week draws on the
# same guidance as a week that went wrong.
QUESTION = (
    "מהן הנחיות התזונה בנושאים שסיכום שבועי עשוי לגעת בהם: קמחים וסוכרים ויום פינוק, "
    "חלון אכילה, כמות ירקות, שתייה, מספר ארוחות ונשנושים, דרגות הפחמימות ומגמת המשקל מול היעד?"
)


def chat_title(week_start: str) -> str:
    """The title the stored recap chat carries: the recap's name and the day its week opened on,
    written the way the app writes dates. A transcript accumulates one recap a week, and the date
    is what tells them apart in the chat list."""
    year, month, day = week_start.split("-")
    return f"{TITLE} {day}/{month}/{year}"


def _violates_any(questionnaire, answers: dict) -> bool:
    return any(
        # A day recorded before a question existed is legal and cannot violate that question's rules.
        rule.question_id in answers and rule.violates(answers[rule.question_id])
        for rule in questionnaire.rules
    )


def text(questionnaire, history: dict) -> str:
    """The week in one line: how many of its seven days were closed, and how many of those broke
    a rule — the count worth acting on, so it is the one named. A week that broke none says so
    rather than counting to zero."""
    if not history:
        return "לא נסגרו ימים השבוע"
    violating = sum(1 for answers in history.values() if _violates_any(questionnaire, answers))
    if violating == 0:
        return f"{TITLE} — נסגרו {len(history)} מתוך 7 ימים, כולם ללא חריגה"
    return f"{TITLE} — נסגרו {len(history)} מתוך 7 ימים, {violating} מהם עם חריגה"


def labeled_history(questionnaire, history: dict) -> dict:
    """The submitted answers keyed by date, each value under its question's Hebrew day-scope
    heading — the vocabulary the answering LLM reads instead of internal question ids."""
    return {date: {questionnaire.question(question_id).day_heading: value
                   for question_id, value in answers.items()}
            for date, answers in history.items()}


def context(questionnaire, history: dict, weights: dict, target) -> str:
    """How to answer, followed by the week the recap is asked about: the closed days' labeled
    answers beside the latest weigh-ins and the target — the same weight block the chat context
    sends, so both senders describe the trend in one vocabulary.

    Both ride here because upstream embeds the question alone to choose the documents grounding the
    answer, and the question is reserved for the subjects the recap asks about.

    To honor the context cap the oldest days go first, one at a time, and the weight block only
    once no day is left: it is small, and it is the one section a week of few closed days still
    has something to say from."""
    days = labeled_history(questionnaire, history)
    data = {_DAYS: days, weight.LABEL: weight.measurements_block(weights, target)}
    sheds = [lambda d=date: days.pop(d) for date in sorted(days)]
    sheds.append(lambda: data.pop(weight.LABEL))
    while True:
        block = f"{INSTRUCTION}\n{json.dumps(data, ensure_ascii=False)}"
        if len(block) <= MAX_CONTEXT_CHARS:
            return block
        sheds.pop(0)()
