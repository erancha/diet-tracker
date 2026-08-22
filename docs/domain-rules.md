# Domain rules

## Meal log and scoring

Each meal is recorded as it happens with a timestamp, a carb grade, and whether it included
vegetables and fruit. Every carb grade carries a point weight defined in
`config/questionnaire.json`; the day's carb score is the sum of its meals' weights. Scoring is
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

## Day lifecycle

- **Questionnaire flooring** — recorded meals floor the end-of-day questionnaire: a day can admit
  more than was tracked, never less. The server-side derivation is the authority for floors and
  submit validation.
- **Water-close** — a fully tracked day closes directly from the tracker with only water entered.
- **Backfill** — entries can be backfilled to yesterday, so after-midnight meals land on the day
  they belong to.

## Shared derivation

The derivation is implemented once per runtime: `src/common/derive.py` server-side as the
authority, `frontend/src/derive.ts` client-side for live dashboard feedback. Both implementations
must satisfy the shared test vectors in `config/derive-vectors.json`, keeping the two runtimes in
lockstep.

## Versioned configuration

`config/questionnaire.json` is a single versioned config holding the questionnaire questions,
their numeric choice values (the carb meal-point weights among them), and the threshold alert
rules.

## Nudges

Scheduled jobs (EventBridge Scheduler, Asia/Jerusalem) run alongside the tracker:

- **Fill reminders** — sent while a day remains unsubmitted.
- **Threshold alerts** — fire over consecutive days violating the configured thresholds, by email
  plus Telegram when a bot token is configured (see
  [Development & deployment](development.md#telegram-optional)).
- **Weekly digest** — a weekly averages summary.
- **Trend chart** — a 7-day trend chart after each submit.
