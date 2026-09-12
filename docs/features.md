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
it is the one thing closing a day asks for.

## The meal log and the daily score

You log each meal as you eat it: its carb source or sources, the helping of each, whether it
carried vegetables or fruit, and its additions. No calories are counted and no food is named — what
the log records is the character of the meal and the interval since the last one.

From those entries comes the day's score: each meal priced by its carb grade at the helping
recorded for it, plus its additions at the amount recorded for each, summed over the day.
Golf-style — lower is better. [The scoring model](domain-rules.md#meal-log-and-scoring) gives the
grade ladder, the second carb source, the fruit escalation and the addition surcharges.

A day closes only from the tracker, once its meals span the configured minimum eating window, and
stays closable through the small hours after midnight. A day never logged goes unrecorded. A closed
day stays readable, and one confirmation reopens it — the record deleted, the meals kept — to add a
forgotten meal and close over the fuller log. See
[Day lifecycle](domain-rules.md#day-lifecycle).

## Weight

Weight is tracked on its own weekly rhythm, beside the daily log rather than inside it. Each
weighing is charted against a target you set, and carries the hour it was taken at, because a
weekly weighing only compares with itself when it is taken at about the same time of day. The
section reads back where you stand in that rhythm and opens itself on the weigh-in morning.

A weight is measured rather than scored: it changes no day's score and raises no alert, so a
climbing weight is something the chart shows rather than a nudge that fires. See
[Weight](domain-rules.md#weight) for the recording rules, the target, deletion and the chart's
spans.

## Trends and history

Under the day tracker, a 10-day trend chart draws one panel per tracked value, the panels stacked
over a single shared date axis.

- The score panel plots a second, dashed line beside the score: the part of each day that came
  from the flour grades and sugar the program excludes from its six non-treat days. The gap
  between the two lines is the part of the day that stayed within the program.
- That panel also frames the weekday the program's treat meal is aimed at, so a lift inside the
  frame reads as a treat meal taken on the intended day and a lift outside it as one taken off
  it. The chart runs one day past a week, so a span ending on the treat day sets it against the
  one before.
- A dot turns red on a day that crossed its rule's limit, and each panel heading names the limit
  it is drawn against.

Below the chart, the same days appear as a table, newest first, one column per question. Tapping a
day's score opens that day's meal log, read-only.

[Excluded points and the treat day](domain-rules.md#shared-derivation) specify how the subtotal
and the framed weekday are derived.

## Reminders and the weekly recap

Messages reach you by email, and by Telegram where a bot token is configured:

- **A last call** for a day still unclosed, late enough that the day is over in practice and still
  inside it.
- **A weekly weigh-in reminder**, which skips anyone who already weighed in that day.
- **A weekly recap** of the week that just ended: a line counting the days that were closed, then
  one bullet per bound a day crossed — the findings the trend chart reddens — and flours and sugars
  on any day but the treat day. Under them comes the answering service's reading of that week,
  which the app asks for on the user's behalf as a follow-up on the recap itself. The exchange is
  stored as one chat, so it appears in the chat list and can be continued there like any other.

The account menu turns all of them off and back on with one switch. Opting out changes nothing
inside the app: a muted account still sees its own violations on closing a day and in the header's
alarm. See [Nudges](domain-rules.md#nudges) for each job's schedule and audience.

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

A chat is its asker's alone until they share it. Sharing a chat opens it to every signed-in user
under the asker's own address — the question, the answer, and the email are what the others see,
read-only and outlined apart from their own, behind a toggle below their own previous chats — and
the asker can take it back at any time.
Sharing is a choice to be read by name, which the confirm says before the chat leaves the asker's
transcript; an answer may cite the asker's own tracked data, and sharing the chat shares that too.
A follow-up on a shared chat stays shared, as does its digest.

A deployment that configures no answering service withholds the chat surface entirely rather than
offering a control that cannot answer.

## User activity (admin)

The admin account alone gets a user-activity section: every signed-up account as a card carrying
its closed-day, meal and chat-question counts over the trailing week and all time, its all-time
weighing count, and whether a target weight is set — never the kilograms. Most active over the
trailing week comes first. The section carries counts and addresses only; no one's recorded content
is readable there, and the API refuses the listing to every other account.
