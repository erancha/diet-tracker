// Entry point: resolves the session before mounting — a signed-in user gets the questionnaire app
// wired to the query client and the token-bound API client, a signed-out visitor gets the landing
// page whose sign-in button starts the Hosted UI flow, and a sign-in rejected by the Hosted UI
// renders as an alert banner. A signed-in session that expires while the tab sits in the background
// is renewed when the tab comes back to the foreground.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createApi } from "./api";
import { AuthError, claims, ensureSignedIn, redirectToLogin, signOut, watchSession } from "./auth";
import { getConfig } from "./config";
import { App } from "./components/App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Landing } from "./components/Landing";
import "./style.css";

const cfg = getConfig();
const root = createRoot(document.getElementById("root")!);

try {
  const tokens = await ensureSignedIn(cfg);

  if (tokens === null) {
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <Landing onSignIn={() => redirectToLogin(cfg)} />
        </ErrorBoundary>
      </StrictMode>,
    );
  } else {
    const api = createApi(cfg, tokens);
    watchSession(cfg, tokens);
    const { email } = claims(tokens.id_token);

    root.render(
      <StrictMode>
        <ErrorBoundary>
          <QueryClientProvider client={new QueryClient()}>
            <App email={email} api={api} reminderHour={cfg.firstReminderHour}
                 firstMealHour={cfg.firstMealHour} mealGapHours={cfg.mealGapHours}
                 onSignOut={() => signOut(cfg)} />
          </QueryClientProvider>
        </ErrorBoundary>
      </StrictMode>,
    );
  }
} catch (err) {
  if (!(err instanceof AuthError)) throw err;
  root.render(<div className="alert">{err.message}</div>);
}
