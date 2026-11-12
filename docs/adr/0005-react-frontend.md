# 0005. React frontend, with runtime settings kept outside the bundle

- Status: Accepted
- Date: 2026-08-18

## Context

The first frontend was about 500 lines of vanilla JavaScript with no build step. One script drew
the form, the history table and a hand-drawn SVG trend chart by writing HTML strings into the
page, and none of it had tests. More reports and charts were planned, and each would have meant
more hand-written DOM and SVG code with nothing to catch a regression.

## Decision

- React 19 with TypeScript, built by Vite, right-to-left throughout.
- Recharts for the charts and TanStack Query for fetching and caching what the API returns.
- Vitest with Testing Library for the component and logic tests, kept beside the code they test.
- Deployment settings (API URL, Cognito domain and client) stay a generated plain script,
  `frontend/public/config.js`, and the questionnaire still loads from the site's own origin
  (ADR 0004), so neither retargeting a stack nor editing the questionnaire needs a rebuild.

## Consequences

- A new report or chart is a component of its own, testable apart from the rest of the screen.
- Publishing the frontend runs `npm run build`, so deploying needs Node and `npm` beside Python.
- The bundle is the same for every stack pair; only `config.js` differs between them.
- The Vite dev server runs on port 8000, the local Cognito callback URL, so local development
  signs in against a deployed stack.
