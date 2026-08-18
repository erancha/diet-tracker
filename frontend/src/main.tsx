// Entry point: completes sign-in before mounting so the component tree only ever renders for an
// authenticated user, then wires the query client and the token-bound API client into the app.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createApi } from "./api";
import { claims, ensureSignedIn, signOut } from "./auth";
import { getConfig } from "./config";
import { App } from "./components/App";
import "./style.css";

const cfg = getConfig();
const tokens = await ensureSignedIn(cfg);
const api = createApi(cfg, tokens);
const { email } = claims(tokens.id_token);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <App email={email} api={api} onSignOut={() => signOut(cfg)} />
    </QueryClientProvider>
  </StrictMode>,
);
