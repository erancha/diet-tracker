import { describe, expect, it, vi } from "vitest";
import { AuthError, ensureSignedIn, logoutUrl, signOut } from "./auth";
import type { AppConfig } from "./config";

const cfg: AppConfig = {
  cognitoDomain: "https://auth.example.com",
  clientId: "client123",
  apiUrl: "https://api.example.com",
  redirectUri: "https://app.example.com/",
  rootEmail: "root@example.com",
  firstReminderHour: 20,
  firstMealHour: 11,
};

describe("logoutUrl", () => {
  it("points at the Cognito logout endpoint with the client id and encoded return address", () => {
    expect(logoutUrl(cfg)).toBe(
      "https://auth.example.com/logout?client_id=client123&logout_uri=https%3A%2F%2Fapp.example.com%2F",
    );
  });
});

describe("ensureSignedIn", () => {
  async function rejectionFor(search: string): Promise<AuthError> {
    sessionStorage.removeItem("tokens");
    history.replaceState(null, "", search);

    const err = await ensureSignedIn(cfg).then(
      () => { throw new Error("resolved instead of rejecting"); },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AuthError);
    return err as AuthError;
  }

  it("raises AuthError with a Hebrew message when the allowlist rejects the email", async () => {
    const err = await rejectionFor(
      "/?error=invalid_request&error_description=PreSignUp+failed+with+error+bob%40example.com+is+not+on+the+diet-tracker+allowlist.+",
    );

    expect(err.message).toBe(
      "האימייל bob@example.com אינו מורשה להשתמש במעקב התזונה.\nלקבלת הרשאה יש לפנות אל root@example.com",
    );
  });

  it("raises AuthError with the raw description for errors it does not recognize", async () => {
    const err = await rejectionFor("/?error=server_error&error_description=Something+went+wrong");

    expect(err.message).toBe("Something went wrong");
  });

  it("resolves to null when there is no session, no auth code, and no error redirect", async () => {
    sessionStorage.removeItem("tokens");
    history.replaceState(null, "", "/");

    await expect(ensureSignedIn(cfg)).resolves.toBeNull();
  });
});

describe("signOut", () => {
  it("drops the stored tokens and navigates to the Cognito logout endpoint", () => {
    sessionStorage.setItem("tokens", JSON.stringify({ id_token: "t", expires_at: 1 }));
    const navigate = vi.fn();

    signOut(cfg, navigate);

    expect(sessionStorage.getItem("tokens")).toBeNull();
    expect(navigate).toHaveBeenCalledWith(logoutUrl(cfg));
  });
});
