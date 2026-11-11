# CLAUDE.md

Serverless Hebrew diet tracker: Python Lambdas (`src/handlers/` over a shared `src/common/`
core), React frontend, DynamoDB, deployed by CloudFormation. README.md covers the product and
architecture. The checkout belongs on the WSL ext4 filesystem, not under `/mnt/c`;
docs/development.md explains the cost.

## Operations scripts (scripts/)

Every ops script sources `scripts/lib/app-env.sh` and loads `scripts/lib/aws-config.sh` through
it (gitignored static credentials + region; committed template `aws-config.example.sh`). A bare
`aws` command failing with NoCredentials means the shell didn't source that file — not an expired
session. The aws CLI itself lives in `~/.local/bin`, which is not always on PATH.

- The git branch selects the stack pair, resolved once in `lib/app-env.sh`: `main` targets
  `diet-tracker` with `diet-tracker-cognito`, any other branch `diet-tracker-fb` with
  `diet-tracker-fb-cognito`; an exported `STACK_NAME` wins. No script takes an environment
  argument.
- Settings live under `scripts/lib/`: `stack-params.sh` (tracked) lists every parameter the two
  stacks are deployed with; the gitignored `secrets.sh` holds the Google OAuth client and the
  gitignored `params.sh` the addresses, sign-up allow-list, per-user chat limits and answering
  service URL, each with a committed `.example.sh`. `.githooks/pre-commit` refuses a commit that
  stages a secrets file or a value from one, or an address of `params.sh` other than the
  published sender, admin and developer addresses (`PUBLISHED_SETTINGS` of `lib/app-env.sh`).
- `aws-helper.sh` — the one script for AWS operations, the same file in every AWS repo; `--help`
  lists its options and then this repo's own from `lib/aws-helper-app.sh`. Fastest health check
  of a function: `scripts/aws-helper.sh --logs <function> --errors --since 1d`, where
  `<function>` is a logical id or a part of one (api, chat, nudge, question — the per-user
  consumer answering the app's own questions, the weekly recap and the morning debrief,
  presignup). `--stack-logs rag` tails Summaries.AI's RAG lambda serving the in-app chat, and
  `--stack-logs <stack>:<logical-id>` any Lambda the credentials can describe. `--set-rag-key`
  copies Summaries.AI's API key into the SSM parameter the chat Lambda reads, without the key
  value touching a file or the terminal. `--delete-stack --empty` empties the frontend
  bucket and tears a stack pair down.
- `test.sh [pytest args]` — `bash -n` on every script, then the venv + pytest wrapper; creates
  and populates `.venv` on first run.
- `deploy.sh` — backend deploy of both stacks; `--frontend` adds the frontend publish and
  `--frontend-only` runs it alone. It packages `build/lambda.zip` through `zip_lambda.py`, so an
  unchanged source deploys as no change. `config/app.json` also ships inside the Lambda package,
  so config edits need `deploy.sh --frontend`, not just the frontend publish.
- `app-config.sh` — writes `frontend/public/config.js` from the stack pair's outputs; `deploy.sh`
  runs it after every backend deploy.
- `emails-helper.sh` — acts on the outgoing mail of one user; `--help` lists what it offers.
  `--rejected <email>` writes a message into the deployed undelivered table so the header's alarm
  bell shows it, the only way to see that surface on an account whose address SES has verified
  (dismissing it in the app deletes the row). `--weekly-recap <email>` runs the weekly recap job
  now, on the working tree's code against the deployed data, printing the email and the chat it
  would store; the answering service is asked for real either way, since its reading of the week
  is most of what there is to preview. `--debrief <email>` does the same for the morning debrief
  of that user's yesterday, when it earned one. `--send` delivers and stores them for that one
  user. `--verify <email>` really asks SES to mail the address its verification request again —
  the only way back for an address whose 24-hour link expired, since sign-up requests it once and
  never resends.
