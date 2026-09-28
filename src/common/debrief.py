"""The morning debrief of a heavy day: which closed day earns one, the question the app asks the
answering service about it on the user's behalf, and the email that carries the answer.

The question is stored as a chat of the user's, so it names the day and its score to stand on
its own in the transcript, and it is worded the way a user asks about a fall — retrieval embeds
the question alone, and that wording is what the knowledge base's night-fall page answers to."""

from common import notify, rules

TITLE = "תחקור יום כבד"

# What the debrief asks, once the day and its score have been named. Retrieval embeds the question
# alone, so it spells out the data fields the knowledge base's night-fall page reads the cause
# from; that wording is what matches the page. The step is asked for the day after the fall, the
# morning the debrief arrives on.
_ASKED = ("למה נפלתי — מה בנתוני המעקב שלי, למשל שעת הארוחה הראשונה, הירקות, מנות השומן "
          "והארוחות בדרגה גבוהה, מסביר את הנפילה, ומה הצעד האחד ליום שאחריו?")


def qualifies(questionnaire, config, answers: dict, on_treat_day: bool) -> bool:
    """Whether a closed day's submitted answers earn the debrief: its score at or past the
    heavy-day bound times the configured factor — the treat day's factor when the day was the
    treat day, whose treat meal is expected to cost."""
    (heavy,) = [rule for rule in questionnaire.rules if rule.id == "heavy_day"]
    factor = config.treat_day_score_factor if on_treat_day else config.score_factor
    return answers["carbs"] >= heavy.at_least * factor


def day_label(day: str) -> str:
    """The day as the app writes a date: day/month/year."""
    year, month, date = day.split("-")
    return f"{date}/{month}/{year}"


def question(day: str, score) -> str:
    """The question asked about `day`, which closed at `score`: the debrief's title, the day by
    weekday and date, its score, and what is asked."""
    return (f"{TITLE}: יום {rules.weekday_name(day)} {day_label(day)} נסגר בציון {score:g}, "
            f"הרבה מעל סף יום כבד. {_ASKED}")


def subject(day: str) -> str:
    return f"{TITLE} {day_label(day)} — {notify.APP_NAME}"


def email_body(asked: str, answer: str) -> str:
    """The email under the subject: the question the app asked, then the answer. The chat the
    app stores holds the same two, so the email and the transcript read alike."""
    return f"{asked}\n{answer}"
