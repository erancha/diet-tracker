# 0006. Knowledge-base chat through the external Summaries.AI service

- Status: Accepted
- Date: 2026-09-01

## Context

The app tracked meals, weight and the daily answers, but could not answer a question about the
diet program itself: its rules lived in documents outside the app. The owner already runs
Summaries.AI, a separate serverless service that answers questions from uploaded documents and
cites the ones it drew on. Each answer costs money upstream, and the browser must never hold the
key that lets a caller spend it.

## Decision

- A `chat` Lambda of its own, behind the same HTTP API, forwards each question to the
  Summaries.AI REST API over stdlib HTTP and shows the answer with its source documents.
- The program's documents, with this app's own guides from `docs/kb/` beside them, are uploaded
  to that service; this stack holds no document index or model of its own.
- The service key travels in the `x-api-key` header, read per request from SSM Parameter Store,
  so the browser never sees it and rotating it needs no redeploy.
- A per-user daily counter in DynamoDB refuses the question that crosses the cap before any paid
  call; the cap is a stack parameter.

## Consequences

- Retrieval, the model and the document store are another repo's to run and pay for; this app
  owns only the question, the cap and the transcript.
- Every question leaves the app for an outside service, and with it whatever context it carries.
- Anything that asks the service has to tolerate it being slow or failing, since its uptime and
  latency are outside this stack's control.
