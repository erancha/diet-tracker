// Google sign-in through the Cognito Hosted UI using the authorization-code + PKCE flow.
// No client secret exists in the browser; the verifier lives in sessionStorage only for the
// duration of the redirect round-trip.

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function claims(idToken) {
  const payload = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(payload));
}

export async function ensureSignedIn(cfg) {
  const stored = JSON.parse(sessionStorage.getItem("tokens") || "null");
  if (stored && stored.expires_at > Date.now() + 60_000) return stored;
  const code = new URLSearchParams(location.search).get("code");
  if (code) return exchangeCode(cfg, code);
  await redirectToLogin(cfg);
}

async function redirectToLogin(cfg) {
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

async function exchangeCode(cfg, code) {
  const response = await fetch(`${cfg.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      code,
      redirect_uri: cfg.redirectUri,
      code_verifier: sessionStorage.getItem("pkce_verifier"),
    }),
  });
  if (!response.ok) throw new Error(`token exchange failed: ${response.status}`);
  const data = await response.json();
  const tokens = { id_token: data.id_token, expires_at: Date.now() + data.expires_in * 1000 };
  sessionStorage.setItem("tokens", JSON.stringify(tokens));
  history.replaceState(null, "", cfg.redirectUri);
  return tokens;
}
