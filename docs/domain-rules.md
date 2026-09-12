# Domain rules

## Meal log and scoring

Each meal is recorded as it happens with a timestamp, the carb source or sources it drew on,
whether it included vegetables or fruit, and its additions (see below). Every carb grade carries a
point weight defined in `config/app.json`; the day's score is the sum of its meals' weights.
Scoring is golf-style: lower is better.

The day's four tracked values all derive from the meal log:

- **Daily score** — sum of the meals' carb-source weights, with the fruit escalation below.
- **Meal count** — number of recorded meals.
- **Vegetable meals** — number of meals that included vegetables.
- **Eating window** — hours between the first and last meal, rounded to the nearest half hour.

## Carb sources on a plate

The grade ladder ranks a meal by the carb source it drew on, so two things the ladder does not
carry are recorded beside it.

**Helping.** A grade is a source, not a quantity, so a meal may be marked a small portion and
counts its grade at the configured percentage. The option is offered only from the configured
grade up, where a lighter helping is a distinction worth drawing and the reduced weight still
lands above zero; a meal switched down to a lighter grade loses the mark with it.

**A second source.** A plate can draw on two sources at once — a grade 2 quinoa bowl beside a
slice of white bread — and no single grade prices such a plate honestly. A meal may therefore
record a second carb source: a grade of its own, carrying its own helping. Both sources are
weighed by the same rule and summed, and it is that sum the fruit escalation floors and the
additions are charged on top of. The grades table stays the one price list for a carb source, so
a second source is priced exactly as it would be were it the whole meal.

The plain no-carb grade is never a second source — a plate drawing on no carb source says so by
carrying none at all — and a meal recorded before the field existed reads as drawing on one.

## Fruit escalation

Every carb grade includes one fruit, so the day's first fruit rides free inside its meal's grade.
Each fruit meal after it counts as grade 5 ("more than one fruit"): its weight is raised to at
least that grade's weight, and never lowered when the meal's own grade is already heavier.

## Additions

A meal may carry additions — accompaniments that are not a grade of their own: a sweet, non-dry
alcohol, nuts, or a load of fat. Each addition pays its configured surcharge (the carbs question's
`additions` in the config) on top of the meal's carb sources, after any fruit escalation. The
surcharge keeps the base grade meaningful: an excellent meal with a cookie stays cheaper than a
heavy meal with one, while an addition on every meal still compounds into a poor day score.

**Amount.** The surcharge prices a routine amount of the accompaniment — one cookie, one glass, a
handful — so each recorded addition also names how much of it there was, from the carbs question's
`amounts` scale, and pays the surcharge at that step's percentage. The scale reaches past 100%: a
taste of a dessert costs less than the surcharge, an evening's worth more. A newly recorded
addition carries the scale's `default`, the routine step the surcharge itself is written for, so a
save that leaves the amount untouched charges the surcharge whole.

The amount is a second axis over the same surcharge, distinct from the helping scale the carb
sources use: helpings only discount a grade already eaten, while an amount may also add to one.

Fat is an addition rather than a grade because it is orthogonal to the carb scale — the grades
rank a meal by its carb source, and a meal carries fat independently of which source it drew on.
As a grade it could only be recorded on a meal with no carb source at all, leaving the fat in a
plate of rice and avocado unscored.

Meals stored under a shape the config has since moved past are read as their current equivalent:
the legacy sweet flag maps to a single sweet addition, an addition stored as a bare id carries no
amount and pays the whole surcharge, and the retired heavy no-carb grade maps to the plain
no-carb grade carrying the fat addition. The mapping reaches either of a meal's carb
sources. Each mapping preserves the meal's combined weight, so retiring a grade never restates a
day's recorded score.

## Heavy meals and heavy days

A meal and a day are heavy on what they cost, never on the carb grade alone: a grade 2 bowl beside
a drink and a spoon of tahini outprices a plain grade 4, and a rule reading the grade would call
the cheaper plate the worse one. Each scope declares its bound once in `config/app.json` —
`heavy_meal` on the carbs question for a single plate, weighed after the fruit escalation, the
additions and the quantity rule; the `heavy_day` rule's `at_least` for the day's summed score.
Neither bound derives from the other, and neither derives from `max`, which bounds a closed
day's stored answer rather than judging one.

The two are set so that a day of heavy meals is a heavy day: three meals at the meal bound reach
the day bound exactly, matching the three meals the `meals` question treats as the day's norm.

Every rule is judged day by day, the treat day included. The tracker, the history table and the
trend chart mark a day the moment it reaches a bound, and the weekly recap counts how many of the
week's days did; no surface reads a day against the day before it. A crossing that falls on the
treat day keeps its mark and is painted amber instead of red: what that day costs is what it is
for, so a high treat day is expected rather than alarming, and a treat day inside every bound
stays green like any other. The frontend's `isViolating` and the backend's `violating_days` are
the two readings of that one statement.

## Day lifecycle

- **Water-close** — the tracker's close button is the only way a day closes, offered once the
  recorded meals span the minimum eating window (`day_close.min_window_hours`), and it asks for
  water alone: every other value is the derived reading of the meal log. A day whose meals never
  span that window — or that was never tracked at all — stays unrecorded.
- **Close validation** — the server re-derives the closing day from its stored meals and rejects
  figures below that derivation, so the meal log stays the authority over what a closed day
  claims.
- **Reopening** — a closed day keeps the tracker on screen: its meals stay readable, as in the
  history table's day view, behind a single add-meal control that asks to reopen the eating
  window. Confirming deletes the day's record — the same deletion the history table offers,
  under the same windows — while the meals survive, so the day is simply open again to take the
  late meal and close over the fuller log.
- **Small-hours grace window** — a day left unclosed at midnight does not vanish: while the clock
  is still before the configured `day_close.close_until`, an unclosed yesterday holding meals
  stays the tracker's target — its late meals can still be recorded or corrected, dated within
  it, and its closing still lands on it. A just-closed yesterday stays on as well, reopenable,
  until the delete bound. Past what applies, the tracker hands over to today. Deleting
  yesterday's record shuts earlier, at `day_close.delete_until`, which never
  outlives the close bound — so no deletion can leave a day that could not be re-closed. The API
  enforces the same two windows from the same config values.
- **Overdue meal** — the tracker's meal inputs sit folded behind the day's figures and its meal
  list, and open expanded when a meal is overdue. A day is overdue in two ways: it passes its
  first-meal hour (the stack's `FirstMealHour`) with nothing recorded, or its most recent meal
  falls the meal-gap span (the stack's `MealGapHours`) behind the clock. The gap is measured from
  when the meal was eaten and stands on its own, so a stale meal opens the inputs however early in
  the day it is. Recording a meal restarts the gap, folding the inputs away again. The previous
  day never nudges — it is over, not running late.

## Shared derivation

The derivation exists as one implementation per language: `src/common/derive.py` in the Python
backend as the authority, `frontend/src/derive.ts` in the browser for live dashboard feedback.
Both implementations
must satisfy the shared test vectors in `config/derive-vectors.json`, keeping the two runtimes in
lockstep.

- **Excluded points** — the same meal walk also decomposes the day's score: per meal, the
  weighed contribution of any carb source graded at or above the carbs question's
  `excluded_grade`, plus the weighed surcharge of every addition its `excluded_additions` names.
  That is what the program excludes from its six non-treat days — the flour grades and sugar,
  and a sweet — while the grades below the bound stay permitted within them. Both figures come
  out of one weighing of each meal, so the part can never disagree with the whole: every term of
  the subtotal is also a term of the score, and the fruit escalation, which belongs to no carb
  source, lifts the score alone. The history payload carries the subtotal per day, read from the
  stored meals rather than written with the day, so every recorded day carries it with nothing
  to backfill;
  the trend chart plots it beside the score, where the gap between the two lines is the part of
  the day that stayed within the program.
- **The treat day** — `treat_day` in the config names the weekday the program's treat meal is
  aimed at, and the trend chart frames that column. Nothing marks a stored day as a treat day and
  no rule reads the weekday: the app prices whatever is recorded, and the frame is a target drawn
  on a chart.

## Weight

The weight log runs beside the day tracker rather than inside it. A weight is measured, not
judged: it enters no day score, no derived floor, and no weekly finding, so a climbing
weight is something the chart shows rather than a nudge that fires.

- **One measurement per calendar day**, in kilograms, recorded for today, carrying the wall-clock
  time it was taken at. Re-recording replaces the day's value and its time, which is how a
  mistyped weight is corrected. The time is stamped from the clock rather than typed — the
  weighing and its recording are the same moment. Weighings recorded before the time was kept
  carry none and read as absent.
- **A single current target**, revised in place. The chart draws it as a reference line and the
  section's at-a-glance summary reads the latest weight against it. A user who has never set one
  has no target, and the chart draws no line.
- **Deletion at any date.** Day records and meals are confined to the running day and its
  small-hours grace window because they feed scoring and the derived floors that validate a
  close. A weight feeds neither, so removing an old one restates nothing — and a measurement
  logged against the wrong day would otherwise have no way out of the chart.
- **Chart span** — the chart opens on the configured number of months and offers wider spans only
  where the recorded series actually reaches past them.
- **Weigh-in rhythm** — the recommendation the weight log serves is a weighing once a week, on the
  same weekday and at about the same hour. The section reads back where the user stands in that
  rhythm: the weigh-in day while it holds no weighing, the next weigh-in day otherwise, how long
  it has been once a week has passed with none, and the usual hour once enough weighings carry a
  time to name one. The usual hour is the middle recorded time of the last few weighings, so it
  names an hour actually weighed at and one stray late weighing does not move it. The reading
  reports and never judges — a weight raises no alert, so a slipped rhythm is stated as elapsed
  days rather than flagged.
- **Weigh-in fold** — the weight section rests folded and opens itself on the weigh-in day while
  the day holds no weighing, the same treatment an overdue meal gives the tracker's meal inputs.
- **Weigh-in reminder** — a weekly nudge on the configured weekday and hour, skipping only a user
  who already recorded a weight that day. The job runs on the weigh-in weekday, so weighing on it
  is the thing being asked for; a weighing on any other day is the drift the weekly rhythm loses
  itself to and excuses nothing. It reaches the user by email, and by Telegram where that channel
  is configured, rather than waiting in the app.

## Versioned configuration

`config/app.json` is the app's single versioned config. Its `questionnaire` element holds the
questions, their numeric choice values (the carb meal-point weights among them), and the threshold
rules; its `version` is stamped on every closed day, so it tracks the questions and their
values alone. Its `day_close` element holds the closing rules: the minimum eating window
(`min_window_hours`), and the small-hours grace bounds — `close_until`, up to which an unclosed
yesterday may still be closed and its meals written, and the never-later `delete_until`, up to
which its record may still be deleted. Its `weight` element holds the weigh-in weekday and hour —
the weekday doubling as the night the weekly recap goes out on — the chart's opening span, and the
kilogram bounds both the API and the frontend input constrain to. Its `treat_day` element names the
weekday the trend chart frames;
like `chat`, no Lambda reads it, so it rides along as a frontend-only section.

Both runtimes read the same file: the Lambda package carries it, and the frontend fetches it from
its own origin. The weigh-in weekday and hour are the one part `scripts/deploy.sh` also lifts out
at deploy time, because an EventBridge cron expression is fixed when the stack deploys. The recap
schedule reuses the weekday from there rather than naming its own, so retargeting the weigh-in
carries the recap to the new night with it.

## Nudges

Scheduled jobs (EventBridge Scheduler, Asia/Jerusalem) run alongside the tracker:

- **Last call** — the day's one tracking reminder, late enough that the day is over in practice
  and still inside it, so what it asks about is the day the user is living. It reaches every user
  whose day remains open, and tells one whose meals are already logged that the day awaits its
  closing rather than its meals: everything but the water is recorded, and the tracker's close
  button is what seals it. A day carrying no meals gets the plain record-your-meals reminder.
- **Weekly recap** — reports seven days ending on the user's last closed day of today and
  yesterday. It fires late on the weigh-in night, when the day is over in practice but may still be
  open in the tracker: a day the user has closed by then belongs to the week it ends and is counted;
  one still open would be reported as missing however diligent the user was, so the window ends the
  day before it instead — that day had its final chance to be closed that morning, at
  `day_close.close_until`. Each user's own days decide, so the same run reports one user's week
  through Thursday and another's through Wednesday. Either way the recap reads the weigh-in
  morning's weight as the freshest one. Each user's recap is produced in an invocation of its
  own, so one slow reading of a week delays no one else's email.

  The email opens with one line — how many of the seven days were closed — and under it one
  bullet per bound a day crossed, counted day by day the way the trend chart reddens a dot and the
  history table a cell, in the wording the chart legend gives that bound. Flours and sugars are
  counted apart, over the six days the program means to keep clear of them; the treat day is what
  they are for, so a day of it is never a finding. A week inside every bound says so in its one
  line. Dates, single days' values and every weekly average stay in the app, a tap away, where the
  closing line points, rather than spending the email's few lines.

  Those findings are the app's own arithmetic. What follows them is the answering service's
  reading of the week: the job stores the findings as a chat of the user's and asks that chat a
  follow-up — "מהן התובנות לשבוע הבא?" — over the path a follow-up the user types takes
  (`src/common/chat_question.py`), the asker's recent tracked data attached as the context block,
  weight measurements and target included. Retrieval embeds the question alone, and the question
  carries the week's findings, so what comes back is guidance about what this week did rather than
  about the program at large.

  The answer replaces the chat it extends, so the week leaves one chat holding the whole exchange,
  titled with the recap's name and the day its week opened on — a transcript accumulating one a
  week is not a column of identical rows. It lists, follows up and summarizes like any other chat.
  The reading is the only part that can go missing: a deployment configuring no answering service,
  and one that fails to answer, both still mail the findings and still leave the recap in the
  transcript for the user to follow up themselves. It is asked outside the daily chat quota, which
  counts the questions the user chose to spend — this one they did not ask.
- **Weigh-in reminder** — a weekly prompt to step on the scale, skipped for anyone who already
  recorded a weight on the weigh-in day itself, on the same channels as the last call above.
- **Trend chart** — a 10-day trend chart after each closed day.

Every job above reads its audience from the pool minus the accounts that have opted out, so one
switch silences all of them — the unconditional weekly recap included. The switch is the account
menu's second item, beside the sign-out it sits with because leaving is when a user decides they
are done being reminded; it toggles, so the same item subscribes again. Opting out changes nothing
inside the app: a muted account still sees its own red marks on closing a day and in the table.
