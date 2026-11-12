# 0004. One configuration file for both runtimes

- Status: Accepted
- Date: 2026-08-18

## Context

The questions, their allowed answers and the alert thresholds are the program's own terms, and
they change as the program is refined. The browser renders the questions and the Lambdas check
the answers and raise the alerts, so both must agree on the same values at all times.

## Decision

- One versioned JSON file under `config/` holds the questions, their values and the alert
  rules.
- The deploy copies it into the Lambda package and publishes it beside the frontend, which
  fetches it from the site's own origin.

## Consequences

- A rule changes in one place, and neither runtime can hold a value the other lacks.
- An edit reaches the Lambdas only through a backend deploy, so a frontend publish alone is not
  enough.
