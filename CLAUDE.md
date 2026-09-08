# CLAUDE.md

Serverless Hebrew diet tracker: Python Lambdas (`src/handlers/` over a shared `src/common/`
core), React frontend, DynamoDB, deployed by CloudFormation. README.md covers the product and
architecture. The checkout belongs on the WSL ext4 filesystem, not under `/mnt/c`;
docs/development.md explains the cost.

## Operations scripts (scripts/)

Every ops script sources `scripts/aws-config.sh` (gitignored static credentials + region;
committed template `aws-config.example.sh`). A bare `aws` command failing with NoCredentials
means the shell didn't source that file — not an expired session. The aws CLI itself lives in
`~/.local/bin`, which is not always on PATH.

- `aws-helper.sh` — resolves stable Lambda targets to the deployed resources and works with
  their CloudWatch logs; `--help` lists targets and options. Fastest health check of a function:
  `scripts/aws-helper.sh --logs <target> --errors --since 1d`. Targets are aliases (api, nudge,
  presignup, rag — Summaries.AI's RAG lambda serving the in-app chat) or `<stack>:<logical-id>`
  for any Lambda the credentials can describe.
- `test.sh [pytest args]` — venv + pytest wrapper; creates and populates `.venv` on first run.
- `deploy.sh` / `sync-frontend.sh` — full stack deploy vs frontend-only publish. `config/app.json`
  also ships inside the Lambda package, so config edits need `deploy.sh`, not just an S3 sync.
- `set-rag-key.sh` — copies Summaries.AI's API key into the SSM parameter the chat Lambda reads,
  without the key value touching a file or the terminal.
- `emails-helper.sh` — simulates one outgoing-mail surface for one user; `--help` lists them.
  `--rejected <email>` writes a message into the deployed undelivered table so the header's alarm
  bell shows it, the only way to see that surface on an account whose address SES has verified
  (dismissing it in the app deletes the row). `--weekly-recap <email>` runs the weekly recap job
  now, on the working tree's code against the deployed data, printing the question, the email and
  the chat it would store; `--send` delivers and stores them for that one user.
