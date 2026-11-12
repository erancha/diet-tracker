# 0001. Serverless on AWS

- Status: Accepted
- Date: 2026-08-18

## Context

The daily diet questionnaire lived in a Google Form. The form collected answers and never
followed up: nothing reminded a user of a day left unanswered or pointed out a habit slipping.
A handful of users answer once or a few times a day, so a server running all month would sit
idle almost all of the time, and the follow-ups need a clock of their own.

## Decision

- Python 3.13 Lambdas behind an API Gateway HTTP API, with a shared core in `src/common/` and
  thin entry points in `src/handlers/`.
- DynamoDB tables billed per request, keyed by the user.
- A static Hebrew right-to-left frontend on S3 behind CloudFront.
- EventBridge Scheduler jobs in Asia/Jerusalem for the reminders and the weekly summary.
- SES for email, and a Telegram bot as an optional second channel.
- CloudFormation stacks for the app and for Cognito (ADR 0002), deployed by bash scripts.

## Consequences

- Nothing runs between requests, so an idle day costs only storage.
- Every follow-up is a scheduled job, whose timing is fixed when the stack deploys.
- All the entry points deploy from one package and read the same tables, so the rules live in
  one place while each entry point scales and is scheduled on its own.
- A request is bounded by the HTTP API's 30-second limit, so any slower work must finish in a
  function that outlives the browser's request.
