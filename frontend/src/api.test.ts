import { afterEach, describe, expect, it, vi } from "vitest";
import { alertMessage, ApiError, createApi } from "./api";
import type { Tokens } from "./auth";
import type { AppConfig } from "./config";

const cfg: AppConfig = {
  cognitoDomain: "https://auth.example.com",
  clientId: "client123",
  apiUrl: "https://api.example.com",
  redirectUri: "https://app.example.com/",
  rootEmail: "root@example.com",
  firstReminderHour: 20,
};

const tokens: Tokens = { id_token: "token", expires_at: 0 };

describe("createApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects with an ApiError carrying the status and the diagnostic detail on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response('{"error": "2026-08-22 is already submitted"}', { status: 409 }),
    ));

    const err = await createApi(cfg, tokens).submitDay({ answers: {}, date: "2026-08-22" }).then(
      () => { throw new Error("resolved instead of rejecting"); },
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).message).toBe(
      'POST /days → 409: {"error": "2026-08-22 is already submitted"}',
    );
  });
});

describe("alertMessage", () => {
  it("maps the already-submitted conflict to a fully Hebrew message", () => {
    const err = new ApiError(409, 'POST /days → 409: {"error": "2026-08-22 is already submitted"}');

    expect(alertMessage("שמירת היום נכשלה", err)).toBe("היום הזה כבר נשלח — יש לרענן את הדף");
  });

  it("leads with the Hebrew action and keeps the technical detail for any other error", () => {
    const err = new ApiError(400, "POST /days → 400: carbs (1) is below the tracked floor (2)");

    expect(alertMessage("שמירת היום נכשלה", err)).toBe(
      "שמירת היום נכשלה (POST /days → 400: carbs (1) is below the tracked floor (2))",
    );
  });

  it("keeps the technical detail of non-API errors such as network failures", () => {
    expect(alertMessage("טעינת הנתונים נכשלה", new TypeError("Failed to fetch"))).toBe(
      "טעינת הנתונים נכשלה (Failed to fetch)",
    );
  });
});
