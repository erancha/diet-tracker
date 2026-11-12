# 0002. Google sign-in behind an allowlist

- Status: Accepted
- Date: 2026-08-18

## Context

Every user of the questionnaire already has a Google account, and the app holds each user's
eating record, which must stay theirs alone. Managing passwords would add a reset flow and a
store of credentials to protect, for no gain over an identity the users already keep. Access
was to be open only to people the operator names.

## Decision

- A Cognito user pool, in its own stack, with Google as the only identity provider and the
  hosted sign-in page issuing the token the HTTP API checks.
- A pre-sign-up Lambda refuses any address the allowlist does not admit; the allowlist is a
  deploy setting the stack receives as a parameter.
- Every stored record is keyed by the user's Cognito `sub`.

## Consequences

- The app stores no password and offers no password flow.
- Admitting a new user is a change to the allowlist and a deploy.
- The allowlist acts only when an account is created: an address removed from it keeps the
  account it already has.
- Deleting a user's Cognito account orphans their rows, since a recreated account gets a new
  `sub`; `scripts/tools/reset-user.sh` deletes both together.
