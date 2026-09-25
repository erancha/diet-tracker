# Domain rules

## Meal log and scoring

Each meal is recorded as it happens with a timestamp, the carb source or sources it drew on,
whether it included vegetables or fruit, its concentrated-fat servings, and its additions (see
below). Every carb grade carries a
point weight defined in `config/app.json`; the day's score is the sum of its meals' weights.
Scoring is golf-style: lower is better.

The day's five tracked values all derive from the meal log:

- **Daily score** — sum of the meals' carb-source weights, with the fruit escalation below.
- **Meal count** — number of recorded meals.
- **Vegetable meals** — number of meals that included vegetables.
- **Fat servings** — sum of the servings the meals recorded (see Fat servings below).
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

A meal may carry additions — accompaniments that are not a grade of their own: a sweet or
non-dry alcohol. Each addition pays its configured surcharge (the carbs question's
`additions` in the config) on top of the meal's carb sources, after any fruit escalation. The
surcharge keeps the base grade meaningful: an excellent meal with a cookie stays cheaper than a
heavy meal with one, while an addition on every meal still compounds into a poor day score.

**Amount.** The surcharge prices a routine amount of the accompaniment — one cookie, one glass —
so each recorded addition also names how much of it there was, from the carbs question's
`amounts` scale, and pays the surcharge at that step's percentage. The scale reaches past 100%: a
taste of a dessert costs less than the surcharge, an evening's worth more. A newly recorded
addition carries the scale's `default`, the routine step the surcharge itself is written for, so a
save that leaves the amount untouched charges the surcharge whole.

The amount is a second axis over the same surcharge, distinct from the helping scale the carb
sources use: helpings only discount a grade already eaten, while an amount may also add to one.

Meals stored under a shape the config has since moved past are read as their current equivalent:
the legacy sweet flag maps to a single sweet addition, an addition stored as a bare id carries no
amount and pays the whole surcharge, and a retired fat or nuts addition reads as one fat serving
each and leaves the additions, so such a day's score carries no fat points either. The
retired-grade mapping reaches either of a meal's carb sources and preserves the meal's combined
weight, so retiring a grade never restates a day's recorded score.

## Fat servings

The program budgets concentrated fat rather than scoring it: 2 to 3 servings a day by stage and
track, never under 2, and fat does not disturb the hormonal balance the carb grades guard. So
fat is not an addition. Each meal records how many servings it carried, by the program's own
serving definitions (a tablespoon of oil, butter or tahini, half an avocado, 15 olives, a
teaspoon of nut butter, 10 nuts or almonds, two small slices of tahini bread), up to the fat
question's `per_meal_max`. A meal built on food over 15% fat counts as one serving in itself: the
program gives those avoiding animal protein a third serving and adds none to such a meal, so the
fat inside fatty food covers part of the day's need, while lean meat, lean fish and 9% cheese
record nothing. The day's figure is the sum, tabulated beside the vegetable meals. One rule bounds
it from above (the program's shield line is a limit), and the question's `warn_below` shows a day
under the floor as the history table's shortfall, never as a crossing: a short day is a habit to
mend, not a breach to count.

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

A heavy day's score is also a link to its own accounting. In the tracker and in the history
table's day view the red score opens a breakdown in the meal list's place: every meal in time
order, each priced term by term — the grade at its helping, the second source, the second fruit's
escalation, each addition at its amount — down to the day's total beside the bound it crossed.
Grades read there at full length with their examples whatever density the tracker's name switch
is set to, since naming what cost what is the point. The same link closes it, and it withdraws
on its own after half a minute so a reader who wandered off finds the log back. The history
table's score cell opens the day view on its meal list; the breakdown is one more click, on that
view's score.

## Day lifecycle

- **Water-close** — the tracker's close button is the only way a day closes, offered once the
  recorded meals span the minimum eating window (`day_close.min_window_hours`) or, for a day
  holding any meal, once the clock passes the evening bound (`day_close.close_from`): a short
  eating day is a legitimate day once the evening is in. It asks for water alone: every other
  value is the derived reading of the meal log. A day never tracked at all stays unrecorded.
- **Close validation** — the server re-derives the closing day from its stored meals and rejects
  figures below that derivation, so the meal log stays the authority over what a closed day
  claims.
- **Reopening** — a closed day keeps the tracker on screen: its meals stay readable, as in the
  history table's day view, behind an add-meal control and the last meal's edit control, either
  of which asks to reopen the eating window. Confirming deletes the day's record — the same
  deletion the history table offers, under the same windows — while the meals survive, so the
  day is simply open again to take the late meal, or the correction the edit control began, and
  close over the corrected log.
- **Small-hours grace window** — a day left unclosed at midnight does not vanish: while the clock
  is still before the configured `day_close.close_until`, an unclosed yesterday holding meals
  stays the tracker's target — its late meals can still be recorded or corrected, and its closing
  still lands on it. A day's eating stretches to that same bound, so a meal timed past midnight
  carries the new date while staying in the record of the day that ran into it: it sorts last in
  that day's log and widens its eating window rather than opening the next day's. A just-closed yesterday stays on as well, reopenable,
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
- **The treat day** — `treat_day` in the config names the weekday the program's week turns on:
  the treat meal is aimed at it, the weekly weigh-in falls on it, and the weekly recap goes out
  on it. The trend chart frames that column. Nothing marks a stored day as a treat day and no
  rule scores by the weekday: the app prices whatever is recorded, and the frame is a target
  drawn on a chart.

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
  treat day and at about the same hour. The section reads back where the user stands in that
  rhythm: the weigh-in day while it holds no weighing, with the program's moment for it — before
  the first meal — rather than any hour read back from earlier weighings, the next weigh-in day
  otherwise, and how long it has been once a week has passed with none. The reading
  reports and never judges — a weight raises no alert, so a slipped rhythm is stated as elapsed
  days rather than flagged.
- **Weigh-in fold** — the weight section rests folded and opens itself on the weigh-in day while
  the day holds no weighing, the same treatment an overdue meal gives the tracker's meal inputs.
- **Weigh-in reminder** — a weekly nudge on the treat day at the configured hour, skipping only a
  user who already recorded a weight that day. The job runs on the weigh-in weekday, so weighing on it
  is the thing being asked for; a weighing on any other day is the drift the weekly rhythm loses
  itself to and excuses nothing. It reaches the user by email, and by Telegram where that channel
  is configured, rather than waiting in the app.

## Versioned configuration

`config/app.json` is the app's single versioned config. Its `questionnaire` element holds the
questions, their numeric choice values (the carb meal-point weights among them), and the threshold
rules; its `version` is stamped on every closed day, so it tracks the questions and their
values alone. Its `day_close` element holds the closing rules: the minimum eating window
(`min_window_hours`), the evening bound (`close_from`) from which a day holding any meal closes
whatever its window, and the small-hours grace bounds — `close_until`, up to which an unclosed
yesterday may still be closed and its meals written, and which doubles as the hour a day's eating
stretches to past midnight, and the never-later `delete_until`, up to which its record may still
be deleted. Its `treat_day` element names the one weekday the program's week turns on: the trend
chart frames it, the weekly weigh-in falls on it, and the weekly recap goes out on it at midday.
Its `weight` element holds the weigh-in hour — the weigh-in declares no weekday of its own, and
the loader rejects one, so the day cannot be stated twice — the chart's opening span, and the
kilogram bounds both the API and the frontend input constrain to. Like `chat`, the `treat_day`
element is read by the frontend straight from the file; unlike it, the nudge Lambda reads it too.

Both runtimes read the same file: the Lambda package carries it, and the frontend fetches it from
its own origin. The treat day and the weigh-in hour are the one part `scripts/deploy.sh` also
lifts out at deploy time, because an EventBridge cron expression is fixed when the stack deploys.
Both the reminder and the recap schedules build on that one weekday parameter, so retargeting the
treat day carries the weigh-in and the recap to the new day with it.

## Nudges

Scheduled jobs (EventBridge Scheduler, Asia/Jerusalem) run alongside the tracker:

- **Last call** — the day's tracking reminder, fired twice in the evening, late enough that the
  day is over in practice and still inside it, so what it asks about is the day the user is
  living, and once more just after midnight, when it still asks about the day that ended for as
  long as the close bound (day_close.close_until) keeps that day open. It reaches every user
  whose day remains open, and tells one whose meals are already logged that the day awaits its
  closing rather than its meals: everything but the water is recorded, and the tracker's close
  button is what seals it. A day carrying no meals gets the plain record-your-meals reminder.
- **Weekly recap** — reports seven days ending on the user's last closed day of today and
  yesterday. It fires at midday on the weigh-in day, while that day is normally still open in the
  tracker, so the week reported ends the day before it — that day had its final chance to be closed
  that morning, at `day_close.close_until`. A user who has already closed the weighing day by noon
  has it counted in the week it ends instead; one still open would be reported as missing however
  diligent the user was. Each user's own days decide, so the same run reports one user's week
  through the weigh-in day and another's through the day before it. Either way the recap reads
  the weigh-in morning's weight as the freshest one. Each user's recap is produced in an invocation of its
  own, so one slow reading of a week delays no one else's email.

  The email opens with one line — the week's first and last day and how many of the seven were
  closed — and under it a short table with this week's counts beside last week's: clean days,
  the closed days off the treat day that spent nothing on flours and sugars (the treat day is
  what the spending is for, so it is neither clean nor not); each bound a day crossed this week,
  counted day by day the way the trend chart reddens a dot and the history table marks the day,
  under the subject's own name; and the latest weighing against the latest one at least a week
  older. A bound crossed last week alone earns a row only when this week crossed it two days
  fewer or more (`weekly_recap.NOTABLE_DAYS`), so a single short day of water last week is never
  dressed up as this week's finding. Each row opens, at the table's right edge, with its
  standing: ✅ when the week meets the program's expectation in that row — no breach, or every
  closed day clean — else 🟢 better than last week, 🔴 worse, ↔️ the same, by direction alone.
  The weight row, each weighing dated, is 🟢 by any drop and 🔴 by any gain, and 👍 when the
  drop passes one percent of the earlier weighing in the week
  (`weekly_recap.ABOVE_EXPECTED_LOSS_PCT`) — guidance puts a sustainable loss at half a percent
  to one percent of body weight a week, so past that is more than the program asks of a week. A
  first week, with no closed day before it, shows last week's counts as absent and marks only
  what is met. The table rides in the body as pipe-separated rows, a convention
  `notify.rtl_html` draws as an HTML table in the email while the plain text, Telegram and the
  chat show the rows as written. Dates, single days' values and every weekly average stay in the
  app, a tap away, where the closing line points; the table is there to set up the reading, not
  to restate the app.

  That table is the app's own arithmetic. What follows it is the answering service's reading of
  the two weeks: the job stores the line and the table as a chat of the user's and asks
  that chat a follow-up over the path a follow-up the user types takes
  (`src/common/chat_question.py`). The follow-up is one question — the insights for the coming
  week, by the program's principles, named so retrieval matches them — and it is all the chat
  list shows under the recap. How to answer rides beside the data instead, as a brief opening
  the context block (`weekly_recap.INSIGHTS_BRIEF`): answer as the program's coach; behavior
  is the way and the weight its outcome, so speak of the behaviors and cite the weight only as
  confirming the direction or not; open by naming the largest change in behavior first, by its
  subject and direction, then saying where the week went once the changes are weighed — one
  day's difference alone is noise, several small moves the same way add up, two days is a real
  change — as a conclusion, never quoting the rule it was weighed by; never name a breach without
  the day it fell on and what was recorded; then pick the one or two behaviors that matter most
  for the coming week, each with why it matters and one concrete, measurable step; do not repeat
  the table's numbers or walk every bound, and stay within eight lines. Under the brief in that block
  (`chat_context.week_context`) are the recap's week and the one before it day by day —
  weekday, treat day, the submitted answers, what the day cost in flours and sugars — and the
  weights with the target. Nothing older rides: the table compares two weeks, and a reading
  given more never referred to it. Retrieval embeds the question
  alone, and the question carries the week's table and the principles, so what comes back is
  guidance about what this user's weeks did rather than about the program at large.

  The answer replaces the chat it extends, so the week leaves one chat holding the whole exchange,
  titled with the recap's name and the range of days it covers — the same words that open the
  email's subject and body, so a reader can place the week on any surface, and a transcript
  accumulating one a week is not a column of identical rows. It lists, follows up and summarizes
  like any other chat.
  The reading is the only part that can go missing: a deployment configuring no answering service,
  and one that fails to answer, both still mail the findings and still leave the recap in the
  transcript for the user to follow up themselves. It is asked outside the daily chat quota, which
  counts the questions the user chose to spend — this one they did not ask.
- **Weigh-in reminder** — a weekly prompt to step on the scale, skipped for anyone who already
  recorded a weight on the weigh-in day itself, on the same channels as the last call above.

Every job above reads its audience from the pool minus the accounts that have opted out, so one
switch silences all of them — the unconditional weekly recap included. The switch is the account
menu's first item; it toggles, so the same item subscribes again. Opting out changes nothing
inside the app: a muted account still sees its own red marks on closing a day and in the table.
