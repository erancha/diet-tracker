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
  dayEndHour: 20,
  firstMealHour: 11,
  mealGapHours: 4,
};

const tokens: Tokens = { id_token: "token", expires_at: 0 };

describe("createApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("triggers re-authentication and never settles on a 401 under an expired token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })));
    const onExpired = vi.fn();

    const outcome = await Promise.race([
      createApi(cfg, tokens, onExpired).getDays().then(() => "settled", () => "settled"),
      new Promise((resolve) => setTimeout(() => resolve("pending"), 10)),
    ]);

    expect(outcome).toBe("pending");
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it("surfaces a 401 under a token still within its lifetime instead of re-authenticating", async () => {
    const live: Tokens = { id_token: "token", expires_at: Date.now() + 3_600_000 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })));
    const onExpired = vi.fn();

    const outcome = await Promise.race([
      createApi(cfg, live, onExpired).getDays().then(() => "resolved", (e: unknown) => e),
      new Promise((resolve) => setTimeout(() => resolve("pending"), 10)),
    ]);

    expect(outcome).toBeInstanceOf(ApiError);
    expect((outcome as ApiError).status).toBe(401);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("sends an edited meal as a whole-meal PUT under the meal's own path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"date": "2026-08-22"}'));
    vi.stubGlobal("fetch", fetchMock);
    const meal = { at: "2026-08-22T13:30:00+03:00", carbs_choice: "carb_grade_4", vegetables: true,
                   fruit: false, additions: ["sweet"], small_portion: false, second_source: null };

    await createApi(cfg, tokens).updateMeal("2026-08-22", "13:30:00-abcdef", meal);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/meals/2026-08-22/13:30:00-abcdef");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual(meal);
  });

  it("puts a weight under the collection path and the target under its own", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response('{"target": null, "entries": []}'));
    vi.stubGlobal("fetch", fetchMock);
    const api = createApi(cfg, tokens);

    await api.recordWeight(76.5);
    await api.setWeightTarget(72);
    await api.deleteWeight("2026-08-20");

    expect(fetchMock.mock.calls.map(([url, init]) => [init.method, url])).toEqual([
      ["PUT", "https://api.example.com/weight"],
      ["PUT", "https://api.example.com/weight/target"],
      ["DELETE", "https://api.example.com/weight/2026-08-20"],
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ kg: 76.5 });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ kg: 72 });
  });

  it("posts a follow-up with the timestamp of the turn it extends, and none for a fresh question", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response('{"answer": "ת", "sources": [], "at": "2026-09-01T10:00:00+00:00"}'));
    vi.stubGlobal("fetch", fetchMock);
    const api = createApi(cfg, tokens);

    await api.ask("שאלה");
    await api.ask("שרשור", "2026-09-01T10:00:00+00:00");

    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ question: "שאלה" });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual(
      { question: "שרשור", at: "2026-09-01T10:00:00+00:00" });
  });

  it("percent-encodes the turn timestamp in the chat delete path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"at": "2026-09-01T10:00:00+00:00"}'));
    vi.stubGlobal("fetch", fetchMock);

    await createApi(cfg, tokens).deleteChatTurn("2026-09-01T10:00:00+00:00");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/chat/2026-09-01T10%3A00%3A00%2B00%3A00");
    expect(init.method).toBe("DELETE");
  });

  it("sends the notification opt-out as a boolean the account is set to", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"muted": true}'));
    vi.stubGlobal("fetch", fetchMock);

    await createApi(cfg, tokens).setMuted(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/notifications");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ muted: true });
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
