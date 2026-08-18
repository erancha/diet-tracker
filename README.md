# diet-tracker

Serverless Hebrew daily diet questionnaire that replaces a Google Form with proactive nudges:
reminders when a day's entry is missing, alerts on rule violations over consecutive days
(email, plus Telegram when a bot token is configured), a weekly summary, and a 7-day trend chart
after each submit. Entries can be backfilled to yesterday for after-midnight logging.

**Stack**: Python 3.13 Lambdas behind an HTTP API with Cognito Google sign-in (small allowlist),
DynamoDB, EventBridge Scheduler (Asia/Jerusalem), and a static RTL frontend on S3 + CloudFront.
Questions and alert rules are one versioned config: `config/questionnaire.json`.

**Scripts** (`scripts/`): `deploy.sh` packages and deploys both CloudFormation stacks and syncs
the frontend; `test.sh` runs the test suite; `delete-stack.sh` tears everything down. Copy
`aws-config.example.sh` and `params.example.sh` to their gitignored siblings and fill them in.

Telegram is optional: store a bot token at SSM parameter `/diet-tracker/telegram/bot-token`
(plus a per-user chat-id map at `/diet-tracker/telegram/chat-map`); while the token parameter is
absent, delivery is email-only.
