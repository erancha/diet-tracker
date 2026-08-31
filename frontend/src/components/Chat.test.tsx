import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { Chat } from "./Chat";

async function ask(question: string) {
  await userEvent.type(screen.getByRole("textbox"), question);
  await userEvent.click(screen.getByRole("button", { name: "שליחה" }));
}

describe("Chat", () => {
  it("shows the question, the answer, and its sources", async () => {
    const api = { ask: vi.fn().mockResolvedValue({
      answer: "מותר עד 4 נקודות פחמימה",
      sources: [{ fileName: "מדריך-פחמימות.pdf", score: 0.83 }],
    }) };
    render(<Chat api={api} />);

    await ask("כמה פחמימות מותר ביום?");

    expect(api.ask).toHaveBeenCalledWith("כמה פחמימות מותר ביום?");
    expect(screen.getByText("כמה פחמימות מותר ביום?")).toBeInTheDocument();
    expect(await screen.findByText("מותר עד 4 נקודות פחמימה")).toBeInTheDocument();
    expect(screen.getByText(/מדריך-פחמימות\.pdf/)).toBeInTheDocument();
  });

  it("shows the daily-quota refusal for a 429", async () => {
    const api = { ask: vi.fn().mockRejectedValue(new ApiError(429, "POST /chat → 429")) };
    render(<Chat api={api} />);

    await ask("שאלה");

    expect(await screen.findByText("מכסת השאלות היומית נוצלה — אפשר לשאול שוב מחר")).toBeInTheDocument();
  });

  it("shows what failed for any other error", async () => {
    const api = { ask: vi.fn().mockRejectedValue(new ApiError(502, "POST /chat → 502")) };
    render(<Chat api={api} />);

    await ask("שאלה");

    expect(await screen.findByText(/השאלה נכשלה/)).toBeInTheDocument();
  });

  it("ignores a blank question", async () => {
    const api = { ask: vi.fn() };
    render(<Chat api={api} />);

    await userEvent.type(screen.getByRole("textbox"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "שליחה" }));

    expect(api.ask).not.toHaveBeenCalled();
  });
});
