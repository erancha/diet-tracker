# 0003. Scoring in both runtimes, held to shared test vectors

- Status: Accepted
- Date: 2026-08-20

## Context

The tracker moved from one end-of-day form to a log of meals entered as they are eaten, with
every daily answer derived from that log: the points, the meal count, the vegetable meals and
the eating window. A user expects those numbers to move as each meal is typed, before anything
is sent. The server, though, cannot trust figures a browser submits, since a closed day's
numbers feed the alerts and the reminders.

## Decision

- The derivation is written twice: `src/common/derive.py`, the authority, which re-derives a
  closing day from its stored meals and refuses figures the meals do not support, and
  `frontend/src/derive.ts`, which updates the numbers on screen as the user types.
- Both are tested against the same vectors in `config/derive-vectors.json`, so a change to
  one that the other does not match fails a suite.

## Consequences

- The screen shows a day's figures with no request to the server.
- Every scoring change is made in two languages and proven against one set of vectors.
- A case the vectors do not cover can still let the two drift.
