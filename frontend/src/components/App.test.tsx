import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Api } from "../api";
import { isoDate, yesterdayOf } from "../dates";
import { trackerQuestionnaire } from "../test-fixtures";
import type { AppConfigFile, DayPayload } from "../types";
import { STORAGE_KEY } from "../viewMode";
import { App } from "./App";

const CONFIG: AppConfigFile = {
  questionnaire: trackerQuestionnaire,
  weight: { weigh_in: { weekday: "SUN", hour: 8 }, chart_months: 3, limits: { min_kg: 40, max_kg: 200 } },
  meals: { max_per_day: 4 },
  day_close: { close_until: "02:00", delete_until: "01:30", min_window_hours: 6 },
  chat: { sample_questions: [] },
};

function emptyDay(date: string): DayPayload {
  return { date, meals: [], derived: { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 } };
}

// A day whose meals are worth targeting: one recorded meal, derived accordingly.
function trackedDay(date: string): DayPayload {
  return {
    date,
    meals: [{ id: "m", at: `${date}T21:00:00+03:00`, carbs_choice: "no_carbs", vegetables: false,
              fruit: false, additions: [], small_portion: false, second_source: null }],
    derived: { carbs: 0, meals: 1, vegetables: 0, eating_window: 0 },
  };
}

// Only the reads the screen issues while mounting resolve; the action methods are bare mocks,
// so a test that reached one would fail loudly instead of passing on fabricated data.
function api(days: Partial<Awaited<ReturnType<Api["getDays"]>>> = {}): Api {
  const now = new Date();
  return {
    getDays: vi.fn().mockResolvedValue({
      days: [], today: emptyDay(isoDate(now)), yesterday: emptyDay(isoDate(yesterdayOf(now))),
      muted: false, ...days,
    }),
    getWeight: vi.fn().mockResolvedValue({ target: null, entries: [] }),
    getChatTranscript: vi.fn().mockResolvedValue({ turns: [] }),
    getDay: vi.fn(), submitDay: vi.fn(), deleteDay: vi.fn(), addMeal: vi.fn(),
    updateMeal: vi.fn(), deleteMeal: vi.fn(), recordWeight: vi.fn(), setWeightTarget: vi.fn(),
    deleteWeight: vi.fn(), setMuted: vi.fn(), getAdminActivity: vi.fn(), ask: vi.fn(),
    deleteChatTurn: vi.fn(),
  };
}

function renderApp(isAdmin: boolean, client: Api = api()) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => CONFIG }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App email="a@b.com" api={client} firstMealHour={9} mealGapHours={3}
           isAdmin={isAdmin} onSignOut={vi.fn()} />
    </QueryClientProvider>,
  );
}

const atClock = (hour: number, minute: number) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 21, hour, minute));
};

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); window.localStorage.clear(); });

describe("App", () => {
  it("shows the admin the chat and activity panels alone, without the tracking sections", async () => {
    renderApp(true);

    expect(await screen.findByRole("button", { name: "שאלות על אבא חטוב" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "פעילות משתמשים" })).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "משקל" })).toBeNull();
    expect(screen.queryByRole("button", { name: "יומן היום" })).toBeNull();
    expect(screen.queryByRole("button", { name: "מגמות" })).toBeNull();
  });

  it("keeps a regular account on the tracking sections and shows it no admin panel", async () => {
    renderApp(false);

    expect(await screen.findByRole("button", { name: "יומן היום" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "משקל" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "מגמות" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "שאלות על אבא חטוב" })).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "פעילות משתמשים" })).toBeNull();
    // The tracker is the only way a day closes — there is no day-end questionnaire section.
    expect(screen.queryByRole("button", { name: "שאלון סיכום היום" })).toBeNull();
  });

  it("condenses the weight and trends sections from the menu and opens them back full", async () => {
    // The stored full view stands in for an account that already left the condensed default.
    window.localStorage.setItem(STORAGE_KEY, "false");
    renderApp(false);
    await screen.findByRole("button", { name: "יומן היום" });

    fireEvent.click(screen.getByRole("button", { name: "תפריט חשבון" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "תצוגה מצומצמת" }));
    for (const name of ["משקל", "מגמות"])
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-expanded", "false");
    // The tracker is the page's working surface and the chat keeps its composer on screen, so
    // the condensed view leaves both sections open.
    expect(screen.getByRole("button", { name: "יומן היום" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "שאלות על אבא חטוב" }))
      .toHaveAttribute("aria-expanded", "true");

    // The item now names the full view, which opens everything.
    fireEvent.click(screen.getByRole("button", { name: "תפריט חשבון" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "תצוגה מלאה" }));
    for (const name of ["משקל", "יומן היום", "מגמות", "שאלות על אבא חטוב"])
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-expanded", "true");
    // The nested meal form is an editing affordance, not a display section: opening everything
    // must not open a form whose unfolding starts composing a meal.
    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("reaches the admin panel with the same view command", async () => {
    window.localStorage.setItem(STORAGE_KEY, "false");
    const client = api();
    (client.getAdminActivity as ReturnType<typeof vi.fn>).mockResolvedValue({ users: [] });
    renderApp(true, client);
    const panel = await screen.findByRole("button", { name: "פעילות משתמשים" });
    // The panel follows the full view the page opened on.
    expect(panel).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "תפריט חשבון" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "תצוגה מצומצמת" }));
    expect(panel).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "תפריט חשבון" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "תצוגה מלאה" }));
    expect(panel).toHaveAttribute("aria-expanded", "true");
  });

  it("opens the next sign-in on the condensed view the last press chose", async () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    renderApp(false);

    expect(await screen.findByRole("button", { name: "מגמות" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "יומן היום" }))
      .toHaveAttribute("aria-expanded", "true");
    // The menu picks up mid-cycle, offering the way back to the full view.
    fireEvent.click(screen.getByRole("button", { name: "תפריט חשבון" }));
    expect(screen.getByRole("menuitem", { name: "תצוגה מלאה" })).toBeInTheDocument();
  });

  it("remembers the view a menu press chose, starting from the condensed default", async () => {
    renderApp(false);
    await screen.findByRole("button", { name: "יומן היום" });

    // No stored choice: the page opens condensed, so the menu offers the full view first.
    fireEvent.click(screen.getByRole("button", { name: "תפריט חשבון" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "תצוגה מלאה" }));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "תפריט חשבון" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "תצוגה מצומצמת" }));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("true");
  });

  it("names the folded trends section's contents in a summary line that opens it", async () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    renderApp(false);
    await screen.findByRole("button", { name: "מגמות" });

    fireEvent.click(screen.getByRole("button", { name: "גרפי מגמה 📈 ונתוני הימים האחרונים 📋" }));

    expect(screen.getByRole("button", { name: "מגמות" }))
      .toHaveAttribute("aria-expanded", "true");
    // Open, the graphs speak for themselves — the summary line withdraws.
    expect(screen.queryByRole("button", { name: "גרפי מגמה 📈 ונתוני הימים האחרונים 📋" })).toBeNull();
  });

  it("folds the chat's previous turns with the condensed view while its composer stays", async () => {
    window.localStorage.setItem(STORAGE_KEY, "false");
    const client = api();
    (client.getChatTranscript as ReturnType<typeof vi.fn>).mockResolvedValue({
      turns: [{ question: "שאלה ישנה", answer: "תשובה", sources: [], at: "2026-09-01T10:00:00" }],
    });
    renderApp(false, client);
    expect(await screen.findByText("שאלה ישנה")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "תפריט חשבון" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "תצוגה מצומצמת" }));

    expect(screen.queryByText("שאלה ישנה")).toBeNull();
    expect(screen.getByRole("button", { name: "צ'אט קודם אחד" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("textbox", { name: "שאלה" })).toBeInTheDocument();
  });

  it("targets yesterday in the small hours while it holds unclosed meals", async () => {
    atClock(1, 0);
    renderApp(false, api({ yesterday: trackedDay(isoDate(yesterdayOf(new Date()))) }));

    expect(await screen.findByRole("button", { name: "יומן אתמול" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "יומן היום" })).toBeNull();
  });

  it("targets today once the close window has passed, whatever yesterday holds", async () => {
    atClock(2, 30);
    renderApp(false, api({ yesterday: trackedDay(isoDate(yesterdayOf(new Date()))) }));

    expect(await screen.findByRole("button", { name: "יומן היום" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "יומן אתמול" })).toBeNull();
  });

  it("targets today in the small hours when yesterday holds no meals", async () => {
    atClock(1, 0);
    renderApp(false);

    expect(await screen.findByRole("button", { name: "יומן היום" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "יומן אתמול" })).toBeNull();
  });

  it("keeps the tracker on screen once today is closed, reduced to the add-meal toggle", async () => {
    const todayStr = isoDate(new Date());
    renderApp(false, api({ days: [{ date: todayStr, answers: { drinking: 3, carbs: 4 } }] }));

    expect(await screen.findByRole("button", { name: "יומן היום" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "הוספת ארוחה" })).toBeInTheDocument();
  });

  it("targets a closed yesterday while it can still be reopened", async () => {
    atClock(1, 0);
    const yesterdayStr = isoDate(yesterdayOf(new Date()));
    renderApp(false, api({
      yesterday: trackedDay(yesterdayStr),
      days: [{ date: yesterdayStr, answers: { drinking: 3, carbs: 4 } }],
    }));

    expect(await screen.findByRole("button", { name: "יומן אתמול" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "יומן היום" })).toBeNull();
  });

  it("hands a closed yesterday to today once the delete bound passes", async () => {
    atClock(1, 45);
    const yesterdayStr = isoDate(yesterdayOf(new Date()));
    renderApp(false, api({
      yesterday: trackedDay(yesterdayStr),
      days: [{ date: yesterdayStr, answers: { drinking: 3, carbs: 4 } }],
    }));

    expect(await screen.findByRole("button", { name: "יומן היום" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "יומן אתמול" })).toBeNull();
  });

  it("closes the open day view when its day is deleted from the history table", async () => {
    // The full view keeps the history table mounted for its row controls.
    window.localStorage.setItem(STORAGE_KEY, "false");
    atClock(1, 0);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const yesterdayStr = isoDate(yesterdayOf(new Date()));
    const client = api({ days: [{ date: yesterdayStr, answers: { drinking: 3, carbs: 4 } }] });
    (client.getDay as ReturnType<typeof vi.fn>).mockResolvedValue(emptyDay(yesterdayStr));
    (client.deleteDay as ReturnType<typeof vi.fn>).mockResolvedValue({ date: yesterdayStr });
    renderApp(false, client);

    fireEvent.click(await screen.findByRole("button", { name: `הצגת היומן של ${yesterdayStr}` }));
    expect(await screen.findByRole("button", { name: "סגירת התצוגה" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `מחיקת הרשומה של ${yesterdayStr}` }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "סגירת התצוגה" })).toBeNull());
  });

  it("withholds yesterday's delete control once the delete bound has passed", async () => {
    // 01:45 sits between the delete bound and the close bound: yesterday's record may still be
    // re-closed, but a deletion now could no longer be re-closed after 02:00 — so it is withheld.
    window.localStorage.setItem(STORAGE_KEY, "false");
    atClock(1, 45);
    const yesterdayStr = isoDate(yesterdayOf(new Date()));
    const client = api({ days: [{ date: yesterdayStr, answers: { drinking: 3, carbs: 4 } }] });
    (client.getDay as ReturnType<typeof vi.fn>).mockResolvedValue(emptyDay(yesterdayStr));
    renderApp(false, client);

    const viewCell = await screen.findByRole("button", { name: `הצגת היומן של ${yesterdayStr}` });
    fireEvent.click(viewCell);
    expect(await screen.findByRole("button", { name: "סגירת התצוגה" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `מחיקת הרשומה של ${yesterdayStr}` })).toBeNull();
  });
});
