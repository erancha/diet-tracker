import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Api } from "../api";
import { isoDate, yesterdayOf } from "../dates";
import { trackerQuestionnaire } from "../test-fixtures";
import type { AppConfigFile, DayPayload } from "../types";
import { App } from "./App";

const CONFIG: AppConfigFile = {
  questionnaire: trackerQuestionnaire,
  weight: { weigh_in: { weekday: "SUN", hour: 8 }, chart_months: 3, limits: { min_kg: 40, max_kg: 200 } },
  meals: { max_per_day: 4 },
  chat: { sample_questions: [] },
};

function emptyDay(date: string): DayPayload {
  return { date, meals: [], derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 } };
}

// Only the reads the screen issues while mounting resolve; the action methods are bare mocks,
// so a test that reached one would fail loudly instead of passing on fabricated data.
function api(): Api {
  const now = new Date();
  return {
    getDays: vi.fn().mockResolvedValue({
      days: [], today: emptyDay(isoDate(now)), yesterday: emptyDay(isoDate(yesterdayOf(now))),
      muted: false,
    }),
    getWeight: vi.fn().mockResolvedValue({ target: null, entries: [] }),
    getChatTranscript: vi.fn().mockResolvedValue({ turns: [] }),
    getDay: vi.fn(), submitDay: vi.fn(), deleteDay: vi.fn(), addMeal: vi.fn(),
    updateMeal: vi.fn(), deleteMeal: vi.fn(), recordWeight: vi.fn(), setWeightTarget: vi.fn(),
    deleteWeight: vi.fn(), setMuted: vi.fn(), getAdminActivity: vi.fn(), ask: vi.fn(),
    deleteChatTurn: vi.fn(),
  };
}

function renderApp(isAdmin: boolean) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => CONFIG }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App email="a@b.com" api={api()} dayEndHour={20} firstMealHour={9} mealGapHours={3}
           isAdmin={isAdmin} onSignOut={vi.fn()} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("App", () => {
  it("shows the admin the chat and activity panels alone, without the tracking sections", async () => {
    renderApp(true);

    expect(await screen.findByRole("button", { name: "שאלות על אבא חטוב" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "פעילות משתמשים" })).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "משקל" })).toBeNull();
    expect(screen.queryByRole("button", { name: "יומן היום" })).toBeNull();
    expect(screen.queryByRole("button", { name: "שאלון סיכום היום" })).toBeNull();
    expect(screen.queryByRole("button", { name: "היסטוריה" })).toBeNull();
  });

  it("keeps a regular account on the tracking sections and shows it no admin panel", async () => {
    renderApp(false);

    expect(await screen.findByRole("button", { name: "יומן היום" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "משקל" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "היסטוריה" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "שאלות על אבא חטוב" })).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "פעילות משתמשים" })).toBeNull();
  });
});
