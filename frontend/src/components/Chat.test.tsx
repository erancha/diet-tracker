import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError, type Api } from "../api";
import type { ChatTurn } from "../types";
import { Chat } from "./Chat";

type ChatApi = Pick<Api, "ask" | "getChatTranscript" | "deleteChatTurn">;

function api(overrides: Partial<ChatApi> = {}): ChatApi {
  return {
    ask: vi.fn(),
    getChatTranscript: vi.fn().mockResolvedValue({ turns: [] }),
    deleteChatTurn: vi.fn(),
    ...overrides,
  };
}

function turn(index: number): ChatTurn {
  return { question: `שאלה ${index}`, answer: `תשובה ${index}`, sources: [],
           at: `2026-09-01T10:00:${String(index).padStart(2, "0")}` };
}

// Newest first, mirroring the order the server returns.
function turns(count: number): ChatTurn[] {
  return Array.from({ length: count }, (_, i) => turn(count - i));
}

async function ask(question: string) {
  await userEvent.type(screen.getByRole("textbox"), question);
  await userEvent.click(screen.getByRole("button", { name: "שליחה" }));
}

describe("Chat", () => {
  it("shows the question, the answer, and its sources", async () => {
    const chatApi = api({ ask: vi.fn().mockResolvedValue({
      answer: "מותר עד 4 נקודות פחמימה",
      sources: [{ fileName: "מדריך-פחמימות.pdf", score: 0.83 }],
    }) });
    render(<Chat api={chatApi} sampleQuestions={[]} />);

    await ask("כמה פחמימות מותר ביום?");

    expect(chatApi.ask).toHaveBeenCalledWith("כמה פחמימות מותר ביום?");
    expect(screen.getByText("כמה פחמימות מותר ביום?")).toBeInTheDocument();
    expect(await screen.findByText("מותר עד 4 נקודות פחמימה")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "יותר" }));
    expect(screen.getByText(/מדריך-פחמימות\.pdf/)).toBeInTheDocument();
  });

  it("opens on the stored transcript, newest first", async () => {
    render(<Chat api={api({ getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(2) }) })}
                 sampleQuestions={[]} />);

    expect(await screen.findByText("שאלה 2")).toBeInTheDocument();
    const texts = screen.getAllByText(/^שאלה \d+$/).map((el) => el.textContent);
    expect(texts).toEqual(["שאלה 2", "שאלה 1"]);
  });

  it("puts a new answer at the top of the transcript", async () => {
    const chatApi = api({
      getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(1) }),
      ask: vi.fn().mockResolvedValue({ answer: "תשובה חדשה", sources: [] }),
    });
    render(<Chat api={chatApi} sampleQuestions={[]} />);
    await screen.findByText("שאלה 1");

    await ask("שאלה חדשה");

    expect(await screen.findByText("תשובה חדשה")).toBeInTheDocument();
    const texts = screen.getAllByText(/^שאלה/).map((el) => el.textContent);
    expect(texts).toEqual(["שאלה חדשה", "שאלה 1"]);
  });

  it("opens with every stored answer collapsed behind its question", async () => {
    render(<Chat api={api({ getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(2) }) })}
                 sampleQuestions={[]} />);
    await screen.findByText("שאלה 2");

    expect(screen.queryByText("תשובה 2")).not.toBeInTheDocument();
    expect(screen.queryByText("תשובה 1")).not.toBeInTheDocument();
  });

  it("renders the whole transcript with no turn-count picker", async () => {
    render(<Chat api={api({ getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(25) }) })}
                 sampleQuestions={[]} />);
    await screen.findByText("שאלה 25");

    expect(screen.getAllByText(/^שאלה \d+$/)).toHaveLength(25);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("toggles an answer open and closed by its question, without the backend", async () => {
    const stored = { question: "שאלה", answer: "תשובה", at: "2026-09-01T10:00:00",
                     sources: [{ fileName: "מדריך.pdf", score: 0.83 }] };
    const chatApi = api({ getChatTranscript: vi.fn().mockResolvedValue({ turns: [stored] }) });
    render(<Chat api={chatApi} sampleQuestions={[]} />);
    const question = await screen.findByRole("button", { name: "שאלה", expanded: false });

    await userEvent.click(question);
    expect(screen.getByText("תשובה")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "שאלה", expanded: true }));
    expect(screen.queryByText("תשובה")).not.toBeInTheDocument();

    // Toggling reveals data the transcript load already holds — no request per click.
    expect(chatApi.getChatTranscript).toHaveBeenCalledTimes(1);
    expect(chatApi.ask).not.toHaveBeenCalled();
  });

  it("keeps the sources behind a more/less toggle inside the open answer", async () => {
    const stored = { question: "שאלה", answer: "תשובה", at: "2026-09-01T10:00:00",
                     sources: [{ fileName: "מדריך.pdf", score: 0.83 }] };
    const chatApi = api({ getChatTranscript: vi.fn().mockResolvedValue({ turns: [stored] }) });
    render(<Chat api={chatApi} sampleQuestions={[]} />);
    await userEvent.click(await screen.findByRole("button", { name: "שאלה" }));

    expect(screen.queryByText(/מדריך\.pdf/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "יותר", expanded: false }));
    expect(screen.getByText(/מדריך\.pdf/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "פחות", expanded: true }));
    expect(screen.queryByText(/מדריך\.pdf/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "יותר" })).toBeInTheDocument();
  });

  it("lists the sources as a table of file and match-percent rows", async () => {
    const stored = { question: "שאלה", answer: "תשובה", at: "2026-09-01T10:00:00",
                     sources: [{ fileName: "מדריך.pdf", score: 0.83 },
                               { fileName: "תפריט.pdf", score: 0.705 }] };
    const chatApi = api({ getChatTranscript: vi.fn().mockResolvedValue({ turns: [stored] }) });
    render(<Chat api={chatApi} sampleQuestions={[]} />);
    await userEvent.click(await screen.findByRole("button", { name: "שאלה" }));
    await userEvent.click(screen.getByRole("button", { name: "יותר" }));

    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "מקור" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "התאמה" })).toBeInTheDocument();
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getAllByRole("cell").map((cell) => cell.textContent))
      .toEqual(["מדריך.pdf", "83%"]);
    expect(within(rows[2]).getAllByRole("cell").map((cell) => cell.textContent))
      .toEqual(["תפריט.pdf", "71%"]);
  });

  it("omits the sources toggle when the answer cites nothing", async () => {
    render(<Chat api={api({ getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(1) }) })}
                 sampleQuestions={[]} />);
    await userEvent.click(await screen.findByRole("button", { name: "שאלה 1" }));

    expect(screen.getByText("תשובה 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "יותר" })).not.toBeInTheDocument();
  });

  it("shows a fresh answer expanded while stored turns stay collapsed", async () => {
    const chatApi = api({
      getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(1) }),
      ask: vi.fn().mockResolvedValue({ answer: "תשובה טרייה", sources: [], at: "2026-09-01T11:00:00" }),
    });
    render(<Chat api={chatApi} sampleQuestions={[]} />);
    await screen.findByText("שאלה 1");

    await ask("שאלה טרייה");

    expect(await screen.findByText("תשובה טרייה")).toBeInTheDocument();
    expect(screen.queryByText("תשובה 1")).not.toBeInTheDocument();
  });

  it("shows what failed when the transcript cannot be loaded", async () => {
    const chatApi = api({ getChatTranscript: vi.fn().mockRejectedValue(new ApiError(502, "GET /chat → 502")) });
    render(<Chat api={chatApi} sampleQuestions={[]} />);

    expect(await screen.findByText(/טעינת השיחה נכשלה/)).toBeInTheDocument();
  });

  it("shows the daily-quota refusal for a 429", async () => {
    const chatApi = api({ ask: vi.fn().mockRejectedValue(new ApiError(429, "POST /chat → 429")) });
    render(<Chat api={chatApi} sampleQuestions={[]} />);

    await ask("שאלה");

    expect(await screen.findByText("מכסת השאלות היומית נוצלה — אפשר לשאול שוב מחר")).toBeInTheDocument();
  });

  it("shows what failed for any other error", async () => {
    const chatApi = api({ ask: vi.fn().mockRejectedValue(new ApiError(502, "POST /chat → 502")) });
    render(<Chat api={chatApi} sampleQuestions={[]} />);

    await ask("שאלה");

    expect(await screen.findByText(/השאלה נכשלה/)).toBeInTheDocument();
  });

  it("deletes a turn once the user confirms", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const chatApi = api({
      getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(2) }),
      deleteChatTurn: vi.fn().mockResolvedValue({ at: turn(2).at }),
    });
    render(<Chat api={chatApi} sampleQuestions={[]} />);
    await screen.findByText("שאלה 2");

    await userEvent.click(screen.getByRole("button", { name: "מחיקת השאלה שאלה 2" }));

    expect(chatApi.deleteChatTurn).toHaveBeenCalledWith(turn(2).at);
    expect(screen.queryByText("שאלה 2")).not.toBeInTheDocument();
    expect(screen.getByText("שאלה 1")).toBeInTheDocument();
  });

  it("keeps the turn when deletion is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const chatApi = api({ getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(1) }) });
    render(<Chat api={chatApi} sampleQuestions={[]} />);
    await screen.findByText("שאלה 1");

    await userEvent.click(screen.getByRole("button", { name: "מחיקת השאלה שאלה 1" }));

    expect(chatApi.deleteChatTurn).not.toHaveBeenCalled();
    expect(screen.getByText("שאלה 1")).toBeInTheDocument();
  });

  it("keeps the turn and shows what failed when deletion fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const chatApi = api({
      getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(1) }),
      deleteChatTurn: vi.fn().mockRejectedValue(new ApiError(502, "DELETE /chat → 502")),
    });
    render(<Chat api={chatApi} sampleQuestions={[]} />);
    await screen.findByText("שאלה 1");

    await userEvent.click(screen.getByRole("button", { name: "מחיקת השאלה שאלה 1" }));

    expect(await screen.findByText(/מחיקת השאלה נכשלה/)).toBeInTheDocument();
    expect(screen.getByText("שאלה 1")).toBeInTheDocument();
  });

  it("lets a freshly answered turn be deleted by the timestamp the server stamped", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const chatApi = api({
      ask: vi.fn().mockResolvedValue({ answer: "תשובה", sources: [], at: "2026-09-01T11:00:00+00:00" }),
      deleteChatTurn: vi.fn().mockResolvedValue({ at: "2026-09-01T11:00:00+00:00" }),
    });
    render(<Chat api={chatApi} sampleQuestions={[]} />);
    await ask("שאלה חדשה");
    await screen.findByText("תשובה");

    await userEvent.click(screen.getByRole("button", { name: "מחיקת השאלה שאלה חדשה" }));

    expect(chatApi.deleteChatTurn).toHaveBeenCalledWith("2026-09-01T11:00:00+00:00");
  });

  it("moves the composer under the answer being replied to and marks the reply in progress", async () => {
    render(<Chat api={api({ getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(1) }) })}
                 sampleQuestions={[]} />);
    await userEvent.click(await screen.findByRole("button", { name: "שאלה 1" }));

    await userEvent.click(screen.getByRole("button", { name: "שאלת המשך על שאלה 1" }));

    const composerRow = screen.getByRole("textbox").closest("li");
    expect(composerRow).toHaveClass("chat-composer");
    expect(screen.getByText("תשובה 1").closest("li")!.nextElementSibling).toBe(composerRow);
    expect(screen.getByRole("button", { name: "שאלת המשך על שאלה 1" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("שאלת המשך")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ביטול שאלת ההמשך" })).toBeInTheDocument();
  });

  it("shows the thinking bubble under the conversation a follow-up extends", async () => {
    const chatApi = api({
      getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(1) }),
      ask: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    render(<Chat api={chatApi} sampleQuestions={[]} />);
    await userEvent.click(await screen.findByRole("button", { name: "שאלה 1" }));
    await userEvent.click(screen.getByRole("button", { name: "שאלת המשך על שאלה 1" }));

    await ask("ומה עוד?");

    const question = screen.getByText("ומה עוד?").closest("li")!;
    expect(question).toHaveClass("chat-user");
    expect(question.previousElementSibling).toBe(screen.getByText("תשובה 1").closest("li"));
    expect(screen.getByText("חושב…").closest("li")).toHaveClass("chat-assistant");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("withdraws the composer while a question awaits its answer", async () => {
    const chatApi = api({ ask: vi.fn().mockReturnValue(new Promise(() => {})) });
    render(<Chat api={chatApi} sampleQuestions={[]} />);

    await ask("שאלה");

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "שליחה" })).toBeNull();
    expect(screen.getByText("חושב…")).toBeInTheDocument();
  });

  it("sends a follow-up as the labeled chain and replaces the turn in place", async () => {
    const chatApi = api({
      getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(2) }),
      ask: vi.fn().mockResolvedValue({ answer: "תשובת המשך", sources: [], at: turn(1).at }),
    });
    render(<Chat api={chatApi} sampleQuestions={[]} />);
    await userEvent.click(await screen.findByRole("button", { name: "שאלה 1" }));
    await userEvent.click(screen.getByRole("button", { name: "שאלת המשך על שאלה 1" }));

    await ask("ומה עוד?");

    expect(chatApi.ask).toHaveBeenCalledWith(
      "השאלה המקורית: שאלה 1\nהתשובה: תשובה 1\nשאלת המשך: ומה עוד?", turn(1).at);
    expect(await screen.findByText("תשובת המשך")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "שאלה 1" })).not.toBeInTheDocument();
    const questions = [...document.querySelectorAll(".chat-question")].map((el) => el.textContent);
    expect(questions).toEqual(
      ["שאלה 2", "השאלה המקורית: שאלה 1\n\nהתשובה: תשובה 1\n\nשאלת המשך: ומה עוד?"]);
    const labels = [...document.querySelectorAll(".chat-question strong")].map((el) => el.textContent);
    expect(labels).toEqual(["השאלה המקורית:", "התשובה:", "שאלת המשך:"]);
  });

  it("extends an already-composed chain without re-wrapping it", async () => {
    const chain = "השאלה המקורית: א\nהתשובה: ב\nשאלת המשך: ג";
    const stored = { question: chain, answer: "ד", sources: [], at: "2026-09-01T10:00:00" };
    const chatApi = api({
      getChatTranscript: vi.fn().mockResolvedValue({ turns: [stored] }),
      ask: vi.fn().mockResolvedValue({ answer: "ו", sources: [], at: stored.at }),
    });
    render(<Chat api={chatApi} sampleQuestions={[]} />);
    await userEvent.click(await screen.findByRole("button", { name: /^השאלה המקורית/ }));
    await userEvent.click(screen.getByRole("button", { name: /^שאלת המשך על/ }));

    await ask("ה");

    expect(chatApi.ask).toHaveBeenCalledWith(`${chain}\nהתשובה: ד\nשאלת המשך: ה`, stored.at);
  });

  it("swaps the composer placeholder to follow-up wording while a reply is in progress", async () => {
    render(<Chat api={api({ getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(1) }) })}
                 sampleQuestions={[]} />);
    await userEvent.click(await screen.findByRole("button", { name: "שאלה 1" }));
    await userEvent.click(screen.getByRole("button", { name: "שאלת המשך על שאלה 1" }));

    expect(screen.getByPlaceholderText("שאלת המשך…")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "ביטול שאלת ההמשך" }));
    expect(screen.getByPlaceholderText("שאלה על אבא חטוב…")).toBeInTheDocument();
  });

  it("cancels a follow-up from its header, sending the next question as standalone", async () => {
    const chatApi = api({
      getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(1) }),
      ask: vi.fn().mockResolvedValue({ answer: "תשובה עצמאית", sources: [], at: "2026-09-01T11:00:00" }),
    });
    render(<Chat api={chatApi} sampleQuestions={[]} />);
    await userEvent.click(await screen.findByRole("button", { name: "שאלה 1" }));
    await userEvent.click(screen.getByRole("button", { name: "שאלת המשך על שאלה 1" }));

    await userEvent.click(screen.getByRole("button", { name: "ביטול שאלת ההמשך" }));
    await ask("שאלה עצמאית");

    expect(screen.getByRole("textbox").closest("li")).toBeNull();
    expect(chatApi.ask).toHaveBeenCalledWith("שאלה עצמאית");
  });

  it("returns the composer to the top once the follow-up is answered", async () => {
    const chatApi = api({
      getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(1) }),
      ask: vi.fn().mockResolvedValue({ answer: "תשובת המשך", sources: [], at: turn(1).at }),
    });
    render(<Chat api={chatApi} sampleQuestions={[]} />);
    await userEvent.click(await screen.findByRole("button", { name: "שאלה 1" }));
    await userEvent.click(screen.getByRole("button", { name: "שאלת המשך על שאלה 1" }));

    await ask("ומה עוד?");

    expect(await screen.findByText("תשובת המשך")).toBeInTheDocument();
    expect(screen.getByRole("textbox").closest("li")).toBeNull();
  });

  it("returns the composer to the top when the replied-to turn is deleted", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const chatApi = api({
      getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(1) }),
      deleteChatTurn: vi.fn().mockResolvedValue({ at: turn(1).at }),
    });
    render(<Chat api={chatApi} sampleQuestions={[]} />);
    await userEvent.click(await screen.findByRole("button", { name: "שאלה 1" }));
    await userEvent.click(screen.getByRole("button", { name: "שאלת המשך על שאלה 1" }));

    await userEvent.click(screen.getByRole("button", { name: "מחיקת השאלה שאלה 1" }));

    expect(screen.getByRole("textbox").closest("li")).toBeNull();
  });

  it("offers each configured sample question as a link labeled by its short form", async () => {
    render(<Chat api={api()} sampleQuestions={[
      { label: "עקרונות", question: "מהם עקרונות התוכנית?" },
      { label: "חלבון", question: "כמה חלבון מומלץ לצרוך ביום?" },
    ]} />);

    expect(screen.getByRole("button", { name: "עקרונות" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "חלבון" })).toBeInTheDocument();
  });

  it("pastes a sample's full question into the composer without sending it", async () => {
    const chatApi = api();
    render(<Chat api={chatApi} sampleQuestions={[
      { label: "חלבון", question: "כמה חלבון מומלץ לצרוך ביום?" },
    ]} />);

    await userEvent.click(screen.getByRole("button", { name: "חלבון" }));

    expect(screen.getByRole("textbox")).toHaveValue("כמה חלבון מומלץ לצרוך ביום?");
    expect(screen.getByRole("button", { name: "שליחה" })).toBeEnabled();
    expect(chatApi.ask).not.toHaveBeenCalled();
  });

  it("disables sending until the composer holds a question", async () => {
    render(<Chat api={api()} sampleQuestions={[]} />);

    expect(screen.getByRole("button", { name: "שליחה" })).toBeDisabled();

    await userEvent.type(screen.getByRole("textbox"), "שאלה");
    expect(screen.getByRole("button", { name: "שליחה" })).toBeEnabled();
  });

  it("clears the composer from its inline clear control", async () => {
    render(<Chat api={api()} sampleQuestions={[]} />);
    await userEvent.type(screen.getByRole("textbox"), "שאלה שהתחרטתי עליה");

    await userEvent.click(screen.getByRole("button", { name: "ניקוי השאלה" }));

    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByRole("button", { name: "שליחה" })).toBeDisabled();
  });

  it("hides the clear control while the composer is empty", async () => {
    render(<Chat api={api()} sampleQuestions={[]} />);

    expect(screen.queryByRole("button", { name: "ניקוי השאלה" })).not.toBeInTheDocument();
  });

  it("lets a question span multiple lines without submitting on Enter", async () => {
    const chatApi = api();
    render(<Chat api={chatApi} sampleQuestions={[]} />);

    await userEvent.type(screen.getByRole("textbox"), "שורה ראשונה{enter}שורה שנייה");

    expect(screen.getByRole("textbox")).toHaveValue("שורה ראשונה\nשורה שנייה");
    expect(chatApi.ask).not.toHaveBeenCalled();
  });

  it("ignores a blank question", async () => {
    const chatApi = api();
    render(<Chat api={chatApi} sampleQuestions={[]} />);

    await userEvent.type(screen.getByRole("textbox"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "שליחה" }));

    expect(chatApi.ask).not.toHaveBeenCalled();
  });

  it("counts the stored turns on a toggle and keeps them folded behind it when opened condensed",
     async () => {
    render(<Chat api={api({ getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(2) }) })}
                 sampleQuestions={[]} defaultTranscriptFolded />);

    const toggle = await screen.findByRole("button", { name: "2 צ'אטים קודמים", expanded: false });
    expect(screen.queryByText("שאלה 1")).toBeNull();

    await userEvent.click(toggle);
    expect(screen.getByText("שאלה 1")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(toggle);
    expect(screen.queryByText("שאלה 1")).toBeNull();
  });

  it("shows the transcript open behind its toggle in the full view, singular for one turn",
     async () => {
    render(<Chat api={api({ getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(1) }) })}
                 sampleQuestions={[]} />);

    expect(await screen.findByText("שאלה 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "צ'אט קודם אחד" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("offers no transcript toggle before any turn exists", async () => {
    render(<Chat api={api()} sampleQuestions={[]} defaultTranscriptFolded />);

    expect(await screen.findByRole("textbox")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /קודמים|קודם/ })).toBeNull();
  });

  it("reveals the folded transcript when a question is sent, so the answer is never hidden",
     async () => {
    const chatApi = api({
      getChatTranscript: vi.fn().mockResolvedValue({ turns: turns(1) }),
      ask: vi.fn().mockResolvedValue({ answer: "תשובה חדשה", sources: [], at: "2026-09-05T10:00:00" }),
    });
    render(<Chat api={chatApi} sampleQuestions={[]} defaultTranscriptFolded />);
    await screen.findByRole("button", { name: "צ'אט קודם אחד" });

    await ask("שאלה חדשה");

    expect(await screen.findByText("תשובה חדשה")).toBeInTheDocument();
    expect(screen.getByText("שאלה 1")).toBeInTheDocument();
  });
});
