import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Api } from "../api";
import { isoDate, yesterdayOf } from "../dates";
import { trackerQuestionnaire } from "../test-fixtures";
import type { AppConfigFile, DayPayload } from "../types";
import { STORAGE_KEY } from "../viewMode";
import { App } from "./App";
import { VERIFY_MAIL_QUESTION } from "./Welcome";
import { TARGET_FLASH_DELAY_MS } from "./useTargetUnsetFlash";
import { INTRO_STAGE_MS } from "./useWelcomeIntro";

const CONFIG: AppConfigFile = {
  questionnaire: trackerQuestionnaire,
  weight: { weigh_in: { weekday: "SUN", hour: 8 }, chart_months: 3, limits: { min_kg: 40, max_kg: 200 } },
  meals: { max_per_day: 4 },
  day_close: { close_until: "02:00", delete_until: "01:30", min_window_hours: 6 },
  treat_day: { weekday: "FRI" },
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
              fruit: false, additions: [], portion: null, second_source: null }],
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
      muted: false, undelivered: [], email_verified: true, loadedInMs: 150, ...days,
    }),
    getWeight: vi.fn().mockResolvedValue({ target: null, entries: [] }),
    getChatTranscript: vi.fn().mockResolvedValue({ turns: [] }),
    // The admin listing loads on mount now that the section always opens expanded, so it is a
    // resolving read like the others.
    getAdminActivity: vi.fn().mockResolvedValue({ users: [] }),
    getDay: vi.fn(), submitDay: vi.fn(), deleteDay: vi.fn(), addMeal: vi.fn(),
    updateMeal: vi.fn(), deleteMeal: vi.fn(), recordWeight: vi.fn(), setWeightTarget: vi.fn(),
    deleteWeight: vi.fn(), setMuted: vi.fn(), ask: vi.fn(),
    deleteChatTurn: vi.fn(), summarizeChatTurn: vi.fn(),
  sourceUrl: vi.fn(), dismissUndelivered: vi.fn(),
  };
}

// Walks the intro's flashed stages in turn: each stage's timer is armed only once the previous
// stage has rendered, so one act per stage.
function advanceIntroStages(...stages: (0 | 1 | 2 | 3 | 4)[]) {
  for (const stage of stages) act(() => vi.advanceTimersByTime(INTRO_STAGE_MS[stage]));
}

// An untouched account whose address SES has not verified, so the welcome panel carries the
// mail step.
function unverified(): Api {
  return api({ email_verified: false });
}

// An account past its first visit by one weighing, with the target as given.
function weighed(target: number | null): Api {
  const client = api();
  client.getWeight = vi.fn().mockResolvedValue({
    target, entries: [{ date: "2026-08-20", kg: 77, at: "07:30" }],
  });
  return client;
}

function renderApp(isAdmin: boolean, client: Api = api(), isDev = false,
                   config: AppConfigFile = CONFIG, chatAvailable = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => config }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App email="a@b.com" api={client} firstMealHour={9} mealGapHours={3}
           isAdmin={isAdmin} isDev={isDev} chatAvailable={chatAvailable} onSignOut={vi.fn()} />
    </QueryClientProvider>,
  );
}

// The tracker questionnaire charts no trend panel, so the timing tests give the carbs question a
// panel title: the label lives beside the chart legend and needs a chart to sit on.
const CHARTING_CONFIG: AppConfigFile = {
  ...CONFIG,
  questionnaire: {
    ...trackerQuestionnaire,
    questions: trackerQuestionnaire.questions.map((q) =>
      q.id === "carbs" ? { ...q, panel_title: "סכום ציוני ארוחות" } : q),
  },
};

describe("history load timing", () => {
  const charting = () => api({ today: trackedDay(isoDate(new Date())) });

  it("labels the chart with the load time for the developer account", async () => {
    renderApp(false, charting(), true, CHARTING_CONFIG);
    expect(await screen.findByText("טעינה: 150ms")).toBeInTheDocument();
  });

  it("withholds the label from every other account", async () => {
    renderApp(false, charting(), false, CHARTING_CONFIG);
    await screen.findByText("חריגה");
    expect(screen.queryByText(/טעינה/)).not.toBeInTheDocument();
  });
});

const atClock = (hour: number, minute: number) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 21, hour, minute));
};

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); window.localStorage.clear(); });

describe("App", () => {
  it("shows the admin the chat and activity panels alone, without the tracking sections", async () => {
    renderApp(true);

    expect(await screen.findByRole("button", { name: "שאלות על סבא בכושר 👴" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "פעילות משתמשים" })).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "משקל" })).toBeNull();
    expect(screen.queryByRole("button", { name: "יומן היום" })).toBeNull();
    expect(screen.queryByRole("button", { name: "מגמות" })).toBeNull();
  });

  it("withholds the chat section where no answering service is configured", async () => {
    renderApp(false, api(), false, CONFIG, false);

    expect(await screen.findByRole("button", { name: "יומן היום" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "שאלות על סבא בכושר 👴" })).toBeNull();
  });

  it("keeps a regular account on the tracking sections and shows it no admin panel", async () => {
    renderApp(false);

    expect(await screen.findByRole("button", { name: "יומן היום" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "משקל" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "מגמות" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "שאלות על סבא בכושר 👴" })).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "פעילות משתמשים" })).toBeNull();
    // The tracker is the only way a day closes — there is no day-end questionnaire section.
    expect(screen.queryByRole("button", { name: "שאלון סיכום היום" })).toBeNull();
  });

  it("opens a first visit on the intro's first stage, and only then", async () => {
    renderApp(false);
    await screen.findByRole("button", { name: "יומן היום" });
    expect(document.querySelector("main")).toHaveClass("intro-0");
  });

  it("shows the mail step only while SES has not verified the address", async () => {
    renderApp(false, unverified());
    expect(await screen.findByRole("button", { name: "אישור המייל" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("greets a verified address with the three tracking steps alone", async () => {
    renderApp(false);
    await screen.findByRole("heading", { name: /ברוכים הבאים/ });
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "אישור המייל" })).not.toBeInTheDocument();
  });

  it("carries the mail step alone to an account past its first visit", async () => {
    const client = weighed(65);
    client.getDays = unverified().getDays;
    renderApp(false, client);

    expect(await screen.findByRole("heading", { name: "אישור כתובת המייל" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "אישור המייל" })).toBeInTheDocument();
    // The account has taken the tracking steps, so only the outstanding one is listed.
    expect(screen.queryByText("רושמים כל ארוחה כשהיא נאכלת")).toBeNull();
    expect(screen.queryByRole("heading", { name: /ברוכים הבאים/ })).toBeNull();
  });

  it("leaves an account no panel once it has started and its address is verified", async () => {
    renderApp(false, weighed(65));
    await screen.findByRole("button", { name: "יומן היום" });

    expect(screen.queryByRole("heading", { name: /ברוכים הבאים/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "אישור כתובת המייל" })).toBeNull();
  });

  it("keeps the welcome panel open through the intro while the mail step shows", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderApp(false, unverified());
    await screen.findByRole("button", { name: "אישור המייל" });
    advanceIntroStages(0, 1, 2, 3, 4);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("folds the welcome panel after the intro's sentences when no mail step shows", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderApp(false);
    await screen.findByRole("heading", { name: /ברוכים הבאים/ });
    advanceIntroStages(0, 1, 2, 3);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("asks the chat the mail-confirmation question from the welcome button, opening the chat", async () => {
    const client = unverified();
    client.ask = vi.fn().mockResolvedValue({ answer: "ככה", sources: [], at: "2026-09-01T10:00:00" });
    renderApp(false, client);
    fireEvent.click(await screen.findByRole("button", { name: /שאלות על סבא בכושר/ }));
    expect(screen.getByRole("button", { name: /שאלות על סבא בכושר/ }))
      .toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "אישור המייל" }));

    expect(await screen.findByText("ככה")).toBeInTheDocument();
    // The app composed the question, so the chat it stores is filed on the app's side.
    expect(client.ask).toHaveBeenCalledWith(VERIFY_MAIL_QUESTION, undefined, true);
    expect(screen.getByRole("button", { name: /שאלות על סבא בכושר/ }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("leaves the intro off an account that has recorded anything", async () => {
    renderApp(false, api({ today: trackedDay(isoDate(new Date())) }));
    await screen.findByRole("button", { name: "יומן היום" });
    expect(document.querySelector("main")!.className).not.toMatch(/intro/);
  });

  it("flashes the target line on an account with weighings but no target, outside the intro", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderApp(false, weighed(null));
    await screen.findByRole("button", { name: "יומן היום" });
    expect(document.querySelector("main")!.className).not.toMatch(/target-flash|intro/);
    act(() => vi.advanceTimersByTime(TARGET_FLASH_DELAY_MS));
    expect(document.querySelector("main")).toHaveClass("target-flash");
    expect(document.querySelector("main")!.className).not.toMatch(/intro/);
  });

  it("flashes nothing once a target is set", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderApp(false, weighed(72));
    await screen.findByRole("button", { name: "יומן היום" });
    act(() => vi.advanceTimersByTime(TARGET_FLASH_DELAY_MS));
    expect(document.querySelector("main")!.className).not.toMatch(/target-flash/);
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
    expect(screen.getByRole("button", { name: "שאלות על סבא בכושר 👴" }))
      .toHaveAttribute("aria-expanded", "true");

    // The item now names the full view, which opens everything.
    fireEvent.click(screen.getByRole("button", { name: "תפריט חשבון" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "תצוגה מלאה" }));
    for (const name of ["משקל", "יומן היום", "מגמות", "שאלות על סבא בכושר 👴"])
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-expanded", "true");
    // The nested meal form is an editing affordance, not a display section: opening everything
    // must not open a form whose unfolding starts composing a meal.
    expect(screen.getByRole("button", { name: "הוספת ארוחה" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the admin panel open regardless of the view command", async () => {
    // The activity listing is what the admin screen exists to show, so it opens expanded and
    // stands outside the menu's view command. The stored full view makes the condensed press
    // the one the menu offers.
    window.localStorage.setItem(STORAGE_KEY, "false");
    const client = api();
    (client.getAdminActivity as ReturnType<typeof vi.fn>).mockResolvedValue({ users: [] });
    renderApp(true, client);
    const panel = await screen.findByRole("button", { name: "פעילות משתמשים" });
    expect(panel).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "תפריט חשבון" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "תצוגה מצומצמת" }));
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
    renderApp(false, api({ days: [{ date: todayStr, answers: { drinking: 3, carbs: 4 }, excluded: 0 }] }));

    expect(await screen.findByRole("button", { name: "יומן היום" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "הוספת ארוחה" })).toBeInTheDocument();
  });

  it("targets a closed yesterday while it can still be reopened", async () => {
    atClock(1, 0);
    const yesterdayStr = isoDate(yesterdayOf(new Date()));
    renderApp(false, api({
      yesterday: trackedDay(yesterdayStr),
      days: [{ date: yesterdayStr, answers: { drinking: 3, carbs: 4 }, excluded: 0 }],
    }));

    expect(await screen.findByRole("button", { name: "יומן אתמול" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "יומן היום" })).toBeNull();
  });

  it("hands a closed yesterday to today once the delete bound passes", async () => {
    atClock(1, 45);
    const yesterdayStr = isoDate(yesterdayOf(new Date()));
    renderApp(false, api({
      yesterday: trackedDay(yesterdayStr),
      days: [{ date: yesterdayStr, answers: { drinking: 3, carbs: 4 }, excluded: 0 }],
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
    const client = api({ days: [{ date: yesterdayStr, answers: { drinking: 3, carbs: 4 }, excluded: 0 }] });
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
    const client = api({ days: [{ date: yesterdayStr, answers: { drinking: 3, carbs: 4 }, excluded: 0 }] });
    (client.getDay as ReturnType<typeof vi.fn>).mockResolvedValue(emptyDay(yesterdayStr));
    renderApp(false, client);

    const viewCell = await screen.findByRole("button", { name: `הצגת היומן של ${yesterdayStr}` });
    fireEvent.click(viewCell);
    expect(await screen.findByRole("button", { name: "סגירת התצוגה" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `מחיקת הרשומה של ${yesterdayStr}` })).toBeNull();
  });
});
