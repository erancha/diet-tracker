# Domain rules

## Meal log and scoring

Each meal is recorded as it happens with a timestamp, a carb grade, whether it included
vegetables or fruit, and its additions (see below). Every carb grade carries a point weight defined in
`config/app.json`; the day's carb score is the sum of its meals' weights. Scoring is
golf-style: lower is better.

The day's four tracked values all derive from the meal log:

- **Carb score** — sum of the meals' carb-grade weights, with the fruit escalation below.
- **Meal count** — number of recorded meals.
- **Vegetable meals** — number of meals that included vegetables.
- **Eating window** — hours between the first and last meal, rounded to the nearest half hour.

## Fruit escalation

Every carb grade includes one fruit, so the day's first fruit rides free inside its meal's grade.
Each fruit meal after it counts as grade 5 ("more than one fruit"): its weight is raised to at
least that grade's weight, and never lowered when the meal's own grade is already heavier.

## Additions

A meal may carry additions — accompaniments that are not a grade of their own: a sweet, non-dry
alcohol, too many nuts, or a heavy load of fat. Each addition pays its configured surcharge (the
carbs question's `additions` in the config) on top of the meal's grade, after any fruit
escalation. The surcharge keeps the base grade meaningful: an excellent meal with a cookie stays
cheaper than a heavy meal with one, while an addition on every meal still compounds into a poor
day score.

Fat is an addition rather than a grade because it is orthogonal to the carb scale — the grades
rank a meal by its carb source, and a meal carries fat independently of which source it drew on.
As a grade it could only be recorded on a meal with no carb source at all, leaving the fat in a
plate of rice and avocado unscored.

Meals stored under a shape the config has since moved past are read as their current equivalent:
the legacy sweet flag maps to a single sweet addition, and the retired heavy no-carb grade maps
to the plain no-carb grade carrying the fat addition. Each mapping preserves the meal's combined
weight, so retiring a grade never restates a day's recorded score.

## Day lifecycle

- **Questionnaire flooring** — recorded meals floor the end-of-day questionnaire: a day can admit
  more than was tracked, never less. The server-side derivation is the authority for floors and
  submit validation.
- **Water-close** — a fully tracked day closes directly from the tracker with only water entered.
- **Answerable day** — the day-end questionnaire answers a day that has ended, so it opens on the
  last one that did: today from the first evening reminder hour (the stack's `ReminderHours`)
  onward, yesterday for the whole stretch before it, including the small hours after midnight.
  Today stays disabled in the day picker until that hour.
- **Overdue meal** — the tracker's meal inputs sit folded behind the day's figures and its meal
  list, and open expanded when a meal is overdue. A day is overdue in two ways: it passes its
  first-meal hour (the stack's `FirstMealHour`) with nothing recorded, or its most recent meal
  falls the meal-gap span (the stack's `MealGapHours`) behind the clock. The gap is measured from
  when the meal was eaten and stands on its own, so a stale meal opens the inputs however early in
  the day it is. Recording a meal restarts the gap, folding the inputs away again.
- **Backfill** — entries can be backfilled to yesterday, so after-midnight meals land on the day
  they belong to.

## Shared derivation

The derivation is implemented once per runtime: `src/common/derive.py` server-side as the
authority, `frontend/src/derive.ts` client-side for live dashboard feedback. Both implementations
must satisfy the shared test vectors in `config/derive-vectors.json`, keeping the two runtimes in
lockstep.

## Weight

The weight log runs beside the day tracker rather than inside it. A weight is measured, not
judged: it enters no day score, no questionnaire floor, and no threshold alert, so a climbing
weight is something the chart shows rather than a nudge that fires.

- **One measurement per calendar day**, in kilograms, recorded for today. Re-recording replaces
  the day's value, which is how a mistyped weight is corrected.
- **A single current target**, revised in place. The chart draws it as a reference line and the
  section's at-a-glance summary reads the latest weight against it. A user who has never set one
  has no target, and the chart draws no line.
- **Deletion at any date.** Day records and meals are confined to a today-and-yesterday window
  because they feed scoring and the derived floors that validate a submission. A weight feeds
  neither, so removing an old one restates nothing — and a measurement logged against the wrong
  day would otherwise have no way out of the chart.
- **Chart span** — the chart opens on the configured number of months and offers wider spans only
  where the recorded series actually reaches past them.
- **Weigh-in reminder** — a weekly nudge on the configured weekday and hour, skipping any user who
  already recorded a weight within the last seven days. It reaches the user by email, and by
  Telegram where that channel is configured, rather than waiting in the app.

## Versioned configuration

`config/app.json` is the app's single versioned config. Its `questionnaire` element holds the
questions, their numeric choice values (the carb meal-point weights among them), and the threshold
alert rules; its `version` is stamped on every submitted day, so it tracks the questions and their
values alone. Its `weight` element holds the weigh-in weekday and hour, the chart's opening span,
and the kilogram bounds both the API and the frontend input constrain to.

Both runtimes read the same file: the Lambda package carries it, and the frontend fetches it from
its own origin. The weigh-in weekday and hour are the one part `scripts/deploy.sh` also lifts out
at deploy time, because an EventBridge cron expression is fixed when the stack deploys.

## Nudges

Scheduled jobs (EventBridge Scheduler, Asia/Jerusalem) run alongside the tracker:

- **Fill reminders** — sent while a day remains unsubmitted.
- **Threshold alerts** — fire over consecutive days violating the configured thresholds, by email
  plus Telegram when a bot token is configured (see
  [Development & deployment](development.md#telegram-optional)).
- **Weekly digest** — a weekly averages summary.
- **Weigh-in reminder** — a weekly prompt to step on the scale, skipped for anyone who already
  recorded a weight that week, on the same channels as the alerts above.
- **Trend chart** — a 7-day trend chart after each submit.
