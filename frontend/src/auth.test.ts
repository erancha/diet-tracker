import { describe, expect, it, vi } from "vitest";
import { logoutUrl, signOut } from "./auth";
import type { AppConfig } from "./config";

const cfg: AppConfig = {
  cognitoDomain: "https://auth.example.com",
  clientId: "client123",
  apiUrl: "https://api.example.com",
  redirectUri: "https://app.example.com/",
};

describe("logoutUrl", () => {
  it("points at the Cognito logout endpoint with the client id and encoded return address", () => {
    expect(logoutUrl(cfg)).toBe(
      "https://auth.example.com/logout?client_id=client123&logout_uri=https%3A%2F%2Fapp.example.com%2F",
    );
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
