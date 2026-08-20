// Google sign-in and sign-out through the Cognito Hosted UI using the authorization-code + PKCE
// flow. No client secret exists in the browser; the verifier lives in sessionStorage only for the
// duration of the redirect round-trip.

import type { AppConfig } from "./config";

export interface Tokens {
  id_token: string;
  expires_at: number;
}

/** Sign-in rejected by the Hosted UI (e.g. the PreSignUp allowlist); the message is user-facing. */
export class AuthError extends Error {}

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function claims(idToken: string): { email: string } {
  const payload = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(payload));
}

/**
 * Resolves the current session: stored tokens, a fresh code exchange when returning from the
 * Hosted UI, or null when no sign-in is underway — the caller then shows the landing page and
 * starts the flow via redirectToLogin only on an explicit user action.
 */
export async function ensureSignedIn(cfg: AppConfig): Promise<Tokens | null> {
  const stored: Tokens | null = JSON.parse(sessionStorage.getItem("tokens") || "null");
  if (stored && stored.expires_at > Date.now() + 60_000) return stored;
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (code) return exchangeCode(cfg, code);
  // A rejected sign-in (e.g. PreSignUp allowlist) comes back as an OAuth error redirect; surface
  // it instead of treating it as signed-out, which would silently offer another doomed sign-in.
  const error = params.get("error");
  if (error) throw new AuthError(userFacingMessage(params.get("error_description") ?? error, cfg.rootEmail));
  return null;
}

export function logoutUrl(cfg: AppConfig): string {
  const params = new URLSearchParams({ client_id: cfg.clientId, logout_uri: cfg.redirectUri });
  return `${cfg.cognitoDomain}/logout?${params}`;
}

// Clearing local tokens alone is not enough: the Hosted UI session cookie would silently sign the
// same Google account back in on the next visit, so sign-out must also hit Cognito's /logout.
export function signOut(cfg: AppConfig, navigate: (url: string) => void = (url) => { location.href = url; }): void {
  sessionStorage.removeItem("tokens");
  navigate(logoutUrl(cfg));
}

// Matches the description Cognito builds around the PermissionError raised by
// src/handlers/presignup.py, capturing the rejected email. Must track that handler's message.
const ALLOWLIST_REJECTION = /^PreSignUp failed with error (\S+) is not on the diet-tracker allowlist/;

// The allowlist rejection is the one error a legitimate user can hit, so it gets a Hebrew message
// matching the app, pointing at the owner for access requests; anything else is unexpected and
// surfaces verbatim for diagnosis.
function userFacingMessage(description: string, rootEmail: string): string {
  const rejected = description.match(ALLOWLIST_REJECTION);
  return rejected
    ? `האימייל ${rejected[1]} אינו מורשה להשתמש במעקב התזונה.\nלקבלת הרשאה יש לפנות אל ${rootEmail}`
    : description;
}

export async function redirectToLogin(cfg: AppConfig): Promise<void> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  sessionStorage.setItem("pkce_verifier", verifier);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: cfg.redirectUri,
    identity_provider: "Google",
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  location.href = `${cfg.cognitoDomain}/oauth2/authorize?${params}`;
}

async function exchangeCode(cfg: AppConfig, code: string): Promise<Tokens> {
  const response = await fetch(`${cfg.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      code,
      redirect_uri: cfg.redirectUri,
      code_verifier: sessionStorage.getItem("pkce_verifier")!,
    }),
  });
  if (!response.ok) throw new Error(`token exchange failed: ${response.status}`);
  const data = await response.json();
  const tokens: Tokens = { id_token: data.id_token, expires_at: Date.now() + data.expires_in * 1000 };
  sessionStorage.setItem("tokens", JSON.stringify(tokens));
  history.replaceState(null, "", cfg.redirectUri);
  return tokens;
}
