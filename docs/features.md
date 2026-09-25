# Feature overview

What each surface of the app does, behind the summary in the [README](../README.md#overview).
Scoring arithmetic, the day's lifecycle and the scheduled jobs are specified in
[Domain rules](domain-rules.md); this document describes what a user sees and links there for the
rule behind it.

## The four principles (שכפ"צ)

Four habits carry the whole tracker: drinking enough water, vegetables in your meals, a short
eating window, and few meals a day. Their Hebrew initials spell שכפ"צ, the prefix every question
in the app carries, and a table at the foot of the signed-out page lists them with their daily
targets.

Three of the four are answered by the meal log itself — vegetable meals, eating window and meal
count are read off the recorded meals rather than asked. Water is the one meals cannot answer, so
it is the one thing closing a day asks for. A fifth figure rides beside the four: the day's
concentrated-fat servings, summed from what each meal recorded, since the program budgets fat at
two to three servings a day rather than scoring it.

## The meal log and the daily score

You log each meal as you eat it: its carb source or sources, the helping of each, whether it
carried vegetables or fruit, its fat servings, and its additions. No calories are counted and no food is named — what
the log records is the character of the meal and the interval since the last one.

From those entries comes the day's score: each meal priced by its carb grade at the helping
recorded for it, plus its additions at the amount recorded for each, summed over the day.
Golf-style — lower is better. [The scoring model](domain-rules.md#meal-log-and-scoring) gives the
grade ladder, the second carb source, the fruit escalation and the addition surcharges.

A day closes only from the tracker, once its meals span the configured minimum eating window or
the evening has come round, and stays closable through the small hours after midnight. A day never
logged goes unrecorded. A closed day stays readable, and one confirmation reopens it — the record
deleted, the meals kept — to add a forgotten meal or correct the last one, and close over the
corrected log. See [Day lifecycle](domain-rules.md#day-lifecycle).

## Weight

Weight is tracked on its own weekly rhythm, beside the daily log rather than inside it. Each
weighing is charted against a target you set, and carries the hour it was taken at, because a
weekly weighing only compares with itself when it is taken at about the same time of day. The
section reads back where you stand in that rhythm and opens itself on the weigh-in morning.

A weight is measured rather than scored: it changes no day's score and raises no alert, so a
climbing weight is something the chart shows rather than a nudge that fires. Every stretch the
weight climbed over stands on the same faint red ground the history table lays under a heavy day,
in the chart and under the two rows of the list beneath it, so a gain reads as a setback at a
glance. When the newest weighing is the one that gained, the section opens on its own for a few
seconds on loading the app and then folds itself away, unless you toggle it or record a weighing
meanwhile. See [Weight](domain-rules.md#weight) for the recording rules, the target, deletion and
the chart's spans.

## Trends and history

Under the day tracker, a 10-day trend chart draws one panel per tracked value, the panels stacked
over a single shared date axis. The span is a calendar window ending today, so a day with nothing
recorded stands as a gap in it rather than shortening it.

- The score panel plots a second, dashed line beside the score: the part of each day that came
  from the flour grades and sugar the program excludes from its six non-treat days. The gap
  between the two lines is the part of the day that stayed within the program.
- That panel also frames the weekday the program's treat meal is aimed at, so a lift inside the
  frame reads as a treat meal taken on the intended day and a lift outside it as one taken off
  it. The chart spans ten days, past a week, so a span ending on the treat day sets it against
  the one before.
- A dot turns red on a day that crossed its rule's limit, and each panel heading names the limit
  it is drawn against.

Below the chart, the same days appear as a table, newest first. A value with a panel of its own is
read there rather than tabulated, so the columns are the questions charting nowhere, the excluded
subtotal, and the day's score. A day whose score crossed the rule grounds its whole row — faintly,
under any cell mark, and amber rather than red on the treat day — with the score itself bold.
Tapping a day's score opens that day's meal log, read-only.

Opening the app greets a crossing rather than leaving it to be found: when yesterday's or the
running day's score has already crossed its bound, a notice names which of them and clears itself
after ten seconds, since it only points at marks the chart and the table are already carrying.
Where it names yesterday, that word is a link: following it opens yesterday's meal log in the same
place the table opens one, unfolding the trends section and bringing the log on screen. The notice
answers to the score alone, as does the one raised on closing a day: too little water, no
vegetables, a fourth meal or a long window mark their own cell red and are left there. A closed
day is judged on its recorded score, a day still open on the score its meals so far derive.

[Excluded points and the treat day](domain-rules.md#shared-derivation) specify how the subtotal
and the framed weekday are derived.

## Reminders and the weekly recap

Messages reach you by email, and by Telegram where a bot token is configured:

- **A last call** for a day still unclosed: twice in the evening, late enough that the day is over
  in practice and still inside it, and once more just after midnight, while the day that ended can
  still be closed.
- **A weekly weigh-in reminder**, which skips anyone who already weighed in that day.
- **A weekly recap** of the week that just ended, named by its range of days in the subject, the
  body and the chat list alike: a line counting the days that were closed, then a table with
  this week's counts beside last week's — clean days, the bounds a day crossed (the findings the
  trend chart reddens), and the weight. Under it comes the answering service's reading of the
  two weeks, asked for on the user's behalf as a follow-up on the recap itself — one
  question in the chat, the brief on how to answer riding beside the data — and written like the
  program's coach: what the table says once the changes are weighed, and the one or two things
  that matter most for the coming week, each with a concrete step. The exchange is stored as one
  chat, so it appears in the chat list and can be continued there like any other.

The account menu turns all of them off and back on with one switch. Opting out changes nothing
inside the app: a muted account still sees its own violations on arrival, on closing a day, and in
the chart and the table. See [Nudges](domain-rules.md#nudges) for each job's schedule and audience.

Every message is sent as right-to-left HTML beside its plain text, so Hebrew reads as written
rather than as the recipient's mail client guesses.

## Mail that could not be delivered

Sign-up asks SES to send the new address its verification request, and until that request is
confirmed the sandboxed SES account cannot mail the address at all. A message SES refuses on those
grounds is not lost to a log line: it is kept and shown behind the header's alarm bell, dated,
until it is dismissed there — so a message addressed to someone still reaches them. The bell shows
the mail itself, the same HTML the email carried, drawn in a frame that may do nothing but draw it.

## Knowledge-base chat

Questions about the diet's principles are answered inside the app. Each question goes to a
knowledge base of the diet's source documents, hosted on
[Summaries.AI](https://github.com/erancha/Summaries.AI-public), and the answer comes back with the
documents it drew on, each openable.

Each question also carries the asker's own recent tracked data — the last week's day summaries and
the meals of today and yesterday — so that answers can cite it. **That data leaves the app for the
external answering service and the LLM behind it.**

Questions are capped per user per day, because each one spends money upstream; the cap is consumed
before the upstream call, and the admin is notified when a user reaches it. Every answered chat is
stored per user, so the transcript survives reloads and follows its user across devices, and a chat
the app wrote — the weekly recap — is marked as such in the list.

Both lists — the user's own chats and the ones others shared — are narrowed by two filters. One
picks a side of the own transcript: every chat, only the ones the user asked, only the ones the
app wrote, or only the ones the user shared; that choice is remembered for the next visit. The
other is a search, opened from a funnel above the lists: its words narrow both lists to the chats
holding them, in the question or in the answer, with `|` between words admitting a chat holding
any of them and `&` demanding all, `&` binding tighter. A search lasts the visit alone, and the
funnel stands filled while one is in force, so a narrowed list reads as narrowed with the search
box folded away. Each list then counts its matches and says beside that how many chats the
filters are holding back, and a question sent, or an earlier chat opened from the composer's
offer, widens both filters so the chat in hand is not one of the chats held back.

An answer can take longer than the API holds a browser's request, which is 30 seconds. The chat
keeps waiting on the answering service past that and stores the answer when it comes, so the app,
its request having failed with no reason from the chat, reads the transcript every few seconds
(`chat.answer_poll_seconds` in `config/app.json`) until the answer is there, saying "still
thinking" meanwhile. A summary of a chat waits the same way. A failure the chat does give a reason
for — the daily cap, the service being down — is shown in the chat's own words at once.

A chat is its asker's alone until they share it. Sharing a chat opens it to every signed-in user
under the asker's own address — the question, the answer, and the email are what the others see,
read-only and outlined apart from their own, behind a toggle below their own previous chats — and
the asker can take it back at any time.
Sharing is a choice to be read by name, which the confirm says before the chat leaves the asker's
transcript; an answer may cite the asker's own tracked data, and sharing the chat shares that too.
A follow-up on a shared chat stays shared, as does its digest.

A deployment that configures no answering service withholds the chat surface entirely rather than
offering a control that cannot answer.

The day tracker's "מה לאכול בארוחה הבאה?" button asks the knowledge base, on the user's behalf,
for two quick recipes that complete today's meals under the program's rules, either the program's
own recipes or equivalents to them: the app states today's counts — meals, meals with vegetables,
fat servings, fruit, a heavy meal, the hour — and the documents decide what fits. A
recipe the program does not hold is marked in the answer as the answering service's own proposal,
so the two kinds never blur. The button sits beside the add-meal heading and reads
greyed until the next meal is within `next_meal.suggest_before_hours` of being due (the first-meal
hour on an empty day, else the meal gap after the latest meal); it stays pressable meanwhile. The
answer is one recommendation chat per user, marked as app-written like the recap and followed up
or deleted like any chat. A press while that chat is younger than `next_meal.reuse_within_hours`
opens it again and spends nothing; otherwise the press asks anew, replacing the chat and spending
one question of the daily cap.

## User activity (admin)

The admin account alone gets a user-activity section: every signed-up account as a card carrying
its closed-day, meal and chat-question counts over the trailing week and all time, its all-time
weighing count, and whether a target weight is set — never the kilograms. Most active over the
trailing week comes first. The section carries counts and addresses only; no one's recorded content
is readable there, and the API refuses the listing to every other account.
