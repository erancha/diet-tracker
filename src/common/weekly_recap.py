"""Renders the weekly Hebrew recap: a title line counting how much of the week was closed, a
table setting the week beside the one before it — clean days, the bounds its days crossed, the
same findings the trend charts redden, and the weight — and under it the answering service's
reading of the weeks behind it.

Every number a week produces is already in the app, so the table names only what asks for
attention, and the reading is where the email spends its lines."""

from common import notify, rules
from common.dates import days_before

# Names the recap wherever it surfaces: its opening line, the email subject, and the title the
# stored chat carries in the transcript.
TITLE = "סיכום שבועי"


def chat_title(week_start: str, week_end: str) -> str:
    """The recap's name with the week it covers: the title the stored chat carries, the email's
    subject, and the opening words of its body, so every surface names the same seven days. A
    transcript accumulates one recap a week, and the range is what tells them apart."""
    return f"{TITLE} {week_label(week_start, week_end)}"


def week_label(week_start: str, week_end: str) -> str:
    """The week's first and last day as one range, written the way the app writes dates and
    saying no more than a reader needs to place it: the days alone within one month, each day
    with its month across a month, and each with its year across a year.

    The ends are joined by a plain hyphen: between two numbers it stays inside their
    left-to-right run under bidi layout, where a dash would be flipped to the paragraph's
    direction and show the range ending on its start."""
    start, end = [day.split("-") for day in (week_start, week_end)]
    if start[0] != end[0]:
        return f"{start[2]}/{start[1]}/{start[0]}-{end[2]}/{end[1]}/{end[0]}"
    if start[1] != end[1]:
        return f"{start[2]}/{start[1]}-{end[2]}/{end[1]}/{end[0]}"
    return f"{start[2]}-{end[2]}/{end[1]}/{end[0]}"


# Where the week's own numbers are, once the recap has said how many days asked for attention.
# It closes the message because notify.send_email sets the app's address under it; the chat the
# app stores shows the line by itself, so it ends as a sentence rather than pointing at a link.
_TRENDS = "הגרפים והטבלה של השבוע במסך המגמות באפליקציה."

# A bound crossed last week alone earns a row only where the difference could not be one day's
# luck: at least this many days fewer this week.
NOTABLE_DAYS = 2
# What a week is expected to take off the scale: guidance puts a sustainable loss at half a
# percent to one percent of body weight a week, so a loss past the top of that band is more
# than the program asks of a week.
ABOVE_EXPECTED_LOSS_PCT = 1.0
# The last-week cell of a count when last week closed no day to count.
_NO_LAST_WEEK = "–"

# The status a row opens with, at the table's right edge. A count meets the program's
# expectation when it has nothing to fault — no breach in that row, every closed day clean — and
# otherwise stands better than, worse than or level with last week's. The weight stands better
# or worse by its direction alone, and above expectation by ABOVE_EXPECTED_LOSS_PCT.
MET, BETTER, WORSE, SAME, ABOVE = "✅", "🟢", "🔴", "↔️", "👍"
_LEGEND = (f"בעמודה הימנית של הטבלה: {MET} עומד בציפייה (בלי חריגה, או כל הימים נקיים), "
           f"{BETTER} טוב יותר מהשבוע שעבר, {WORSE} פחות טוב, {SAME} ללא שינוי, "
           f"{ABOVE} ירידה במשקל מעבר לצפוי לשבוע.")

# What the app asks the answering service on the user's behalf once the recap is written, sent as
# a follow-up on the recap itself so the table above it is what retrieval reads. It is the one
# line the chat list shows under the recap, so it stays a question, carrying the program's own
# vocabulary for retrieval to match; how to answer it is the brief below, which rides beside the
# data and never in the transcript.
INSIGHTS_QUESTION = ("מהן התובנות לשבוע הבא, לפי עקרונות התוכנית — עקביות לאורך זמן, ימים נקיים, "
                     "יום פינוק אחד שאינו גולש, איזון הורמונלי ושובע?")

# How the reading is to be written: a coach's weighing of the table, then the one or two things
# that matter most. Behavior is the way and the weight its outcome, so the largest change is
# sought among the behaviors and every step aims at one; direction is weighed, not thresholded —
# one day alone is noise, several small moves the same way add up, two days is a real change —
# and a breach is never named without the day it fell on and what was recorded.
INSIGHTS_BRIEF = "\n".join([
    "הנחיות לתשובה: לענות כמאמן/ת של התוכנית, לפי עקרונותיה, ולא לתת ליום או יומיים חלשים להסיט "
    "שבוע שלם.",
    _LEGEND,
    "המשקל הוא התוצאה, לא הדרך. הדרך היא ההתנהגות שבטבלה — ימים נקיים, שתיה, ארוחות, חלון "
    "אכילה, ירקות, מנות שומן, ציון יומי — ועליה מדברים; המשקל נזכר כתוצאה שמאשרת את הכיוון או "
    "לא, ואף צעד אינו מכוון אליו.",
    "לפתוח במשפט או שניים שמפרשים את הטבלה שבשאלה, שמציבה את השבוע לצד השבוע שעבר: לנקוב קודם "
    "בשינוי הגדול ביותר בהתנהגות, בשם הנושא שלו ובכיוונו, ואז לומר לאן השבוע הלך בסך הכול, "
    "כשמשקללים את גודל השינויים ואת כיוונם המצטבר — הבדל של יום אחד לבדו הוא רעש, כמה שינויים "
    "קטנים באותו כיוון מצטברים, ושינוי של יומיים ומעלה הוא שינוי של ממש. לכתוב את המסקנה בלבד, "
    "במילים, בלי לצטט את ההנחיות האלה ובלי כותרות כמו \"מה השתפר:\".",
    "הנתונים שלמטה: השבוע הזה והשבוע שלפניו יום־יום, והמשקלים. כל חריגה שמזכירים — לומר באיזה "
    "יום היא היתה ומה נרשם בו, לפי הנתונים יום־יום, כדי שהקורא יבין את ההקשר; לא להזכיר חריגה "
    "בלי ההקשר שלה.",
    "אחר כך לבחור את הדבר האחד או השניים בהתנהגות שהכי ישפיעו על השבוע הבא, ולכל אחד: למה הוא "
    "חשוב לפי התוכנית, וצעד אחד קונקרטי ומדיד לשבוע הבא.",
    "לא לחזור על המספרים שבטבלה ולא לעבור על כל חריגה בנפרד. עד שמונה שורות.",
])
_INSIGHTS_TITLE = "תובנות לשבוע הבא:"


def text(questionnaire, week_start: str, week_end: str, days: dict, excluded: dict,
         treat_weekday: str, weights: dict, insights: str | None = None) -> str:
    """The week as a title line and a table: which seven days it is and how many were closed,
    then this week's counts beside last week's — clean days, days over each bound, the latest
    weighing against the one a week before it.

    `days` and `excluded` are the closed days and what each day with meals spent on flours and
    sugars, over at least the week and the one before it. Clean days are the closed days off the
    treat day that spent nothing: the treat day is what the spending is for, so it is neither
    clean nor not. A bound row is there when a day crossed it this week, counted day by day the
    way the charts redden a dot and the table a cell, or when last week crossed it NOTABLE_DAYS
    more times — a bound no day crossed says nothing, and a single short day last week is not a
    finding about this one. Each row opens with its status: MET when this week has no breach in
    that row or every closed day clean, else BETTER, WORSE or SAME against last week's count; the
    weight row, each weighing dated, is BETTER by any drop, WORSE by any gain, and ABOVE when the
    drop passes ABOVE_EXPECTED_LOSS_PCT of the earlier weighing. Last week's counts read as
    absent when it closed no day, and a row then carries no status unless it is met. The rest of
    the week's numbers are a tap away, where the line at the end points.

    The answering service's reading of the weeks rides under the table when there is one — the
    email carries it, the recap the app stores does not, because the follow-up that asks for it
    turns that stored recap into the conversation the reading answers."""
    title = chat_title(week_start, week_end)
    history = _between(days, week_start, week_end)
    if not history:
        return f"{title} — לא נסגרו ימים השבוע."
    lines = [f"{title} — נסגרו {len(history)} מתוך 7 ימים."]
    lines += _table(questionnaire, week_start, history, days, excluded, treat_weekday, weights)
    if insights is not None:
        lines += ["", _INSIGHTS_TITLE, insights]
    return "\n".join(lines + ["", _TRENDS])


def _table(questionnaire, week_start, this_week, days, excluded, treat_weekday, weights) -> list:
    """The table's rows as body lines, header first."""
    last_week = _between(days, days_before(week_start, 7), days_before(week_start, 1))
    off_treat = sum(1 for day in this_week if not rules.falls_on(day, treat_weekday))
    clean = (rules.clean_days(this_week, excluded, treat_weekday),
             rules.clean_days(last_week, excluded, treat_weekday))
    every_day_clean = off_treat > 0 and clean[0] == off_treat
    rows = [(_status(clean[0] - clean[1], every_day_clean, bool(last_week)),
             "ימים נקיים", clean[0], clean[1])]
    crossed = (rules.crossed_days(questionnaire, this_week),
               rules.crossed_days(questionnaire, last_week))
    for rule in questionnaire.rules:
        subject = rules.subject_name(questionnaire, rule)
        now, then = (week[subject] if subject in week else 0 for week in crossed)
        if now or then - now >= NOTABLE_DAYS:
            rows.append((_status(then - now, now == 0, bool(last_week)),
                         f"חריגות {subject}", now, then))
    cells = [(status, subject, str(now), str(then) if last_week else _NO_LAST_WEEK)
             for status, subject, now, then in rows]
    weighed = _weighings_a_week_apart(weights)
    if weighed is not None:
        (day, kg), (before, was) = weighed
        cells.append((_weight_status(kg, was), 'משקל (ק"ג)', _dated(kg, day), _dated(was, before)))
    return [notify.table_row(["", "", "השבוע", "שבוע שעבר"])] + [notify.table_row(row)
                                                                  for row in cells]


def _dated(kg, day) -> str:
    """A weighing as its cell reads: the kilograms and the day and month it was taken on."""
    return f"{kg:g} ({day[8:]}/{day[5:7]})"


def _status(gain, met, compared) -> str:
    """A count row's mark: `gain` is how many days better this week is than last in the row's
    own terms, `met` whether this week has nothing to fault in it, `compared` whether last week
    is there to be measured against at all."""
    if met:
        return MET
    if not compared:
        return ""
    if gain > 0:
        return BETTER
    if gain < 0:
        return WORSE
    return SAME


def _weight_status(kg, was) -> str:
    """The weight row's mark, by the direction of the change and, for a drop, by whether it
    passes what a week is expected to take off."""
    if was - kg >= was * ABOVE_EXPECTED_LOSS_PCT / 100:
        return ABOVE
    if kg < was:
        return BETTER
    if kg > was:
        return WORSE
    return SAME


def _weighings_a_week_apart(weights) -> tuple | None:
    """The latest weighing and the latest one dated at least seven days before it, each as
    (day, kg); None when either is missing. A weekly weigh-in pairs one Friday with the one
    before, and a daily weigher is still read a week apart rather than against yesterday."""
    if not weights:
        return None
    latest = max(weights)
    earlier = [day for day in weights if day <= days_before(latest, 7)]
    if not earlier:
        return None
    before = max(earlier)
    return (latest, weights[latest]["kg"]), (before, weights[before]["kg"])


def _between(by_day: dict, start: str, end: str) -> dict:
    """The entries dated within the inclusive range."""
    return {day: value for day, value in by_day.items() if start <= day <= end}

