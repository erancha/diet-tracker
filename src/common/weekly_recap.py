"""Renders the weekly Hebrew recap: how much of the week was closed, and which of the app's bounds
its days crossed — the same findings the trend charts redden, counted over the week.

Every number a week produces is already in the app, so the recap names only what asks for attention
and points at the trends screen for the rest."""

from common import rules

# Names the recap wherever it surfaces: its opening line, the email subject, and the title the
# stored chat carries in the transcript.
TITLE = "סיכום שבועי"


def chat_title(week_start: str) -> str:
    """The title the stored recap chat carries: the recap's name and the day its week opened on,
    written the way the app writes dates. A transcript accumulates one recap a week, and the date
    is what tells them apart in the chat list."""
    year, month, day = week_start.split("-")
    return f"{TITLE} {day}/{month}/{year}"


# Where the week's own numbers are, once the recap has said how many days asked for attention.
# It closes the message because notify.send_email sets the app's address under it; the chat the
# app stores shows the line by itself, so it ends as a sentence rather than pointing at a link.
_TRENDS = "הגרפים והטבלה של השבוע במסך המגמות באפליקציה."

# What the app asks the answering service on the user's behalf once the recap is written, sent as
# a follow-up on the recap itself so the findings below are what retrieval reads.
INSIGHTS_QUESTION = "מהן התובנות לשבוע הבא?"
_INSIGHTS_TITLE = "תובנות לשבוע הבא:"


def text(questionnaire, history: dict, excluded: dict, treat_weekday: str,
         insights: str | None = None) -> str:
    """The week as the app shows it: how much of it was closed, then one line per bound a day
    crossed, counted day by day the way the charts redden a dot and the table a cell.

    A subject no day crossed says nothing — a recap names what asks for attention, and the rest of
    the week's numbers are a tap away, where the line at the end points.

    Flours and sugars are counted apart, against the program's own week: points spent on them are
    a finding on the six days meant to stay clear of them, and are what the treat day is for on the
    seventh, so that day never counts.

    The answering service's reading of the week rides under the findings when there is one — the
    email carries it, the recap the app stores does not, because the follow-up that asks for it
    turns that stored recap into the conversation the reading answers."""
    if not history:
        return "לא נסגרו ימים השבוע"
    lines = [f"{TITLE} — נסגרו {len(history)} מתוך 7 ימים"]
    for rule in questionnaire.rules:
        days = rules.violating_days(rule, history)
        if days:
            question = questionnaire.question(rule.question_id)
            name = question.day_title or question.panel_title or question.day_heading
            lines.append(f"• {name} — חריגה ({rules.bound_label(rule)}) {_days(days)}")
    unclean = sum(1 for day, points in excluded.items()
                  if points > 0 and not rules.falls_on(day, treat_weekday))
    if unclean:
        lines.append(f"• קמחים וסוכרים {_days(unclean)} שאינם יום פינוק" if unclean > 1
                     else "• קמחים וסוכרים ביום אחד שאינו יום פינוק")
    if insights is not None:
        lines += ["", _INSIGHTS_TITLE, insights]
    return "\n".join(lines + ["", _TRENDS])


def _days(count: int) -> str:
    """A day count as the recap says it, so one day is not written as a numeral."""
    return "ביום אחד" if count == 1 else f"ב-{count} ימים"
