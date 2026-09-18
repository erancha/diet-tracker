# Design patterns

The same few shapes recur throughout the code: one gateway per store, a dispatch table behind each
door, values parsed once into frozen objects, and every dependency handed in rather than reached
for. [Architecture](architecture.md) describes where the pieces run; this describes how they are
put together inside.

## Data access behind one gateway

`Store` (`src/common/store.py`) is the only code that touches the day, meal, nudge-state and weight
tables. Numbers cross that boundary as `float` and `int` in app code and as `Decimal` inside
DynamoDB, and the conversion lives there and nowhere else, so no caller has to know which side of
the line it is on.

The records that sit outside `Store` — the chat transcript and the kept undelivered messages — have
gateways of their own in `chat_history.py` and `undelivered.py`. Both read through
`paging.query_all`, which follows the pagination cursor to the end: stopping at the first page
would silently shorten a user's own records, which reads as content that was deleted.

## Stored records are upcast as they are read

A questionnaire that retires a grade or renames a helping leaves records written under the old
vocabulary in the table. `store.py` maps those ids to their current equivalents on the way out —
`_RETIRED_GRADES`, `_LEGACY_LIGHT_SECOND_GRADES`, `_RETIRED_PORTIONS` — so a re-derived day keeps
its score and nothing above the store branches on which version wrote a meal.

## One door, one dispatch table

Each Lambda has a single `handler` that maps its event to a private function and raises on anything
unmapped: `api.py` on the API Gateway `routeKey`, `nudge.py` on the `{"job": ...}` the scheduler
sends. An unrecognised route is a deployment mismatch between the template and the code, so it
fails loudly rather than returning an empty success.

What the handlers keep is only the work an HTTP request or a schedule brings — reading a body,
spending a quota, turning a failure into a status code. `webapi.response` is the one JSON envelope
all of them return.

## AWS inputs gathered once, job logic left pure

`NudgeEnv` (`src/handlers/nudge.py`) is a frozen dataclass holding every AWS-derived input a
scheduled job needs — tables, clients, addresses, config. The jobs take it as a parameter, so what
they decide is a function of their inputs and a test constructs the environment instead of patching
the world.

## Configuration parsed once into frozen objects

`appconfig.load` turns `config/app.json` into `AppConfig` and its nested frozen dataclasses,
validating every value as it goes: a weekday that is not a weekday, an hour outside the day, a
chart span the selector does not offer, weight limits that span no range. Every value the file
declares is required. A malformed config is a deployment fault, and it surfaces at load rather than
in the middle of serving a request.

The questionnaire's own vocabulary is objects too. `Scale` holds the percentage arithmetic a
quantity axis needs, and `Portions` and `Amounts` extend it with only the rule that distinguishes
them — the helping threshold below which no choice is offered, and the default step a newly
recorded addition carries.

## Rules judge one value and name their own bound

A threshold rule answers `violates(value)` for a single day's answer; `rules.violating_days` counts
them across a history and `rules.bound_label` writes the bound the way the app shows it beside a
mark. The trend chart's red dots, the history table's red cells and the weekly recap all ask the
same rule rather than restating the comparison.

## Services outside the stack sit behind one client each

`chat.py` carries every call to the answering service and `notify.py` every outgoing message, both
over stdlib `urllib` so the Lambdas need no third-party HTTP dependency. Neither absorbs a failure:
an unreachable or erroring service raises, because what to do about it — a 502, a logged skip, a
retry on the queue — belongs to the caller.

`chat_question.answer` is the one flow that asks a question on a user's behalf: context block,
upstream call, transcript write. The chat endpoint and the weekly recap both go through it, so a
question the app composes reaches the service in the same shape a user's own question takes.

## The frontend is handed what it uses

`createApi(cfg, tokens, onExpired)` returns the `Api` interface bound to one signed-in user's
tokens, and components receive it as a prop. Nothing below the entry point reaches for a global,
which is what lets the component tests run against a fake client.

`main.tsx` is the single place that wires the app: it resolves the session, builds the API client,
and injects config, identity and callbacks into the tree, under an error boundary and the query
client. Environment settings arrive separately, as `window.CONFIG` typed by `AppConfig` and
generated per environment into `public/config.js`, so retargeting a deployment needs no rebuild.

A rejected request becomes an `ApiError` carrying the status alongside the server's own Hebrew
wording, and `alertMessage` decides from it what the user reads. Timed and folding behaviour lives
in hooks — `useWindDownFold`, `useFoldAll`, `useWelcomeIntro`, `useTargetUnsetFlash` — apart from
the components that render it.

## Tests supply their own doubles

`tests/conftest.py` defines the fakes the suite runs against, such as `FakeSes`, which records what
was sent and can be primed to raise instead. AWS itself is faked with `moto`, so store and handler
tests exercise the real query and condition expressions. The two scoring implementations are held
to shared vectors, described under
[scoring in two languages](architecture.md#scoring-lives-in-two-languages).

## Failure surfaces where it happens

Missing keys, unknown ids and impossible states raise rather than resolving to a plausible default.
A coerced value would produce a quietly wrong day score or a quietly shorter message, far from
whatever actually broke; an exception at the fault line names it.
