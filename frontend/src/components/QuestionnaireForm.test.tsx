import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionnaireForm } from "./QuestionnaireForm";
import { fixtureQuestionnaire } from "../test-fixtures";

function renderForm() {
  const onSubmit = vi.fn();
  const onValidationError = vi.fn();
  render(
    <QuestionnaireForm questionnaire={fixtureQuestionnaire} onSubmit={onSubmit} onValidationError={onValidationError} />,
  );
  return { onSubmit, onValidationError };
}

describe("QuestionnaireForm", () => {
  it("renders a fieldset per question", () => {
    renderForm();
    for (const text of ["שתיה", "חלון אכילה", "נשנושים"]) {
      expect(screen.getByRole("group", { name: text })).toBeInTheDocument();
    }
  });

  it("rejects submission when a multi question has no selection", async () => {
    const user = userEvent.setup();
    const { onSubmit, onValidationError } = renderForm();
    await user.click(screen.getByLabelText("3 ליטר"));
    await user.click(screen.getByLabelText("8 שעות"));
    await user.click(screen.getByRole("button", { name: "שליחה" }));
    expect(onValidationError).toHaveBeenCalledWith("יש לסמן לפחות אפשרות אחת בשאלת נשנושים");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits single answers as strings and multi answers as arrays", async () => {
    const user = userEvent.setup();
    const { onSubmit, onValidationError } = renderForm();
    await user.click(screen.getByLabelText("3 ליטר"));
    await user.click(screen.getByLabelText("8 שעות"));
    await user.click(screen.getByLabelText("אגוזים"));
    await user.click(screen.getByRole("button", { name: "שליחה" }));
    expect(onSubmit).toHaveBeenCalledWith({ drinking: "mid", window: "h8", snacks: ["nuts"] });
    expect(onValidationError).not.toHaveBeenCalled();
  });
});
