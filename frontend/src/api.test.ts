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
  trackerStartHour: 12,
};

const tokens: Tokens = { id_token: "token", expires_at: 0 };

describe("createApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("clears the stored tokens, triggers re-authentication, and never settles on a 401", async () => {
    sessionStorage.setItem("tokens", JSON.stringify(tokens));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })));
    const reauthenticate = vi.fn();

    const outcome = await Promise.race([
      createApi(cfg, tokens, reauthenticate).getDays().then(() => "settled", () => "settled"),
      new Promise((resolve) => setTimeout(() => resolve("pending"), 10)),
    ]);

    expect(outcome).toBe("pending");
    expect(sessionStorage.getItem("tokens")).toBeNull();
    expect(reauthenticate).toHaveBeenCalledOnce();
  });

  it("sends an edited meal as a whole-meal PUT under the meal's own path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"date": "2026-08-22"}'));
    vi.stubGlobal("fetch", fetchMock);
    const meal = { at: "2026-08-22T13:30:00+03:00", carbs_choice: "grade4", vegetables: true,
                   fruit: false, additions: ["sweet"] };

    await createApi(cfg, tokens).updateMeal("2026-08-22", "13:30:00-abcdef", meal);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/meals/2026-08-22/13:30:00-abcdef");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual(meal);
  });

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
