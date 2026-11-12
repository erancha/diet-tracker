# Tools

Hands-on tools for one user's data, run from the repo root against the stack pair the git branch
selects. Each prints its full usage with `--help`.

- `reset-user.sh <email>` — returns one user to a first-time sign-in, deleting their Cognito
  account and rows; `--keep-account` wipes the log only.
- `clone-user-data.sh mirror | fictive | delete` — from a feature branch only: copies a user's
  production rows into the branch's stacks, or into fictive accounts, and deletes them again.
- `temp-pull-demo-data.sh <email>` — a read-only dump of one user's tracked days, to seed the
  demo page.

Back to the [README](../../README.md).
