import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionnaireForm } from "./QuestionnaireForm";
import type { AnswerValue, Derived, Questionnaire } from "../types";

const questionnaire: Questionnaire = {
  version: 3,
  questions: [
    { id: "drinking", type: "single", text: "שתיה",
      choices: [{ id: "l2_5", label: "2.5 ליטר", value: 2.5 }, { id: "l3", label: "3 ליטר", value: 3 }] },
    { id: "meals", type: "single", text: "ארוחות",
      choices: [{ id: "m2", label: "2 ארוחות", value: 2 }, { id: "m3", label: "3 ארוחות", value: 3 },
                { id: "over_3", label: "מעל 3", value: 4 }] },
    { id: "carbs", type: "points", text: "פחמימות", max: 30, tooltip: "סכום הנקודות מכל הארוחות",
      choices: [{ id: "no_carbs", label: "ללא", value: 0 }] },
  ],
  rules: [],
};
const zeroFloors: Derived = { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 };

function renderForm(floors: Derived = zeroFloors, onSubmit = vi.fn(),
                    stored?: Record<string, AnswerValue>, onPendingChange = vi.fn(),
                    onValidationError = vi.fn()) {
  render(<QuestionnaireForm questionnaire={questionnaire} floors={floors} stored={stored}
                            onSubmit={onSubmit} onValidationError={onValidationError}
                            onPendingChange={onPendingChange} />);
  return onSubmit;
}

const DISCARD_LABEL = "ביטול שינויים";

describe("QuestionnaireForm", () => {
  // What the discard prompt is answered with, per case; the cases that never reach it leave it
  // at false, the answer that changes nothing.
  let confirmed = false;
  beforeEach(() => vi.spyOn(window, "confirm").mockImplementation(() => confirmed));
  afterEach(() => vi.restoreAllMocks());

  it("disables radio choices below the floor", () => {
    renderForm({ ...zeroFloors, meals: 3 });
    expect(screen.getByLabelText("2 ארוחות")).toBeDisabled();
    expect(screen.getByLabelText("3 ארוחות")).toBeEnabled();
  });

  it("pins the carbs slider to the floor", () => {
    renderForm({ ...zeroFloors, carbs: 12 });
    const slider = screen.getByRole("slider");
    expect(slider).toHaveValue("12");
    expect(slider).toHaveAttribute("min", "12");
    expect(slider).toHaveAttribute("max", "30");
  });

  it("submits numeric answers including the slider value", () => {
    const onSubmit = renderForm();
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    fireEvent.click(screen.getByLabelText("מעל 3"));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "שליחה" }));
    expect(onSubmit).toHaveBeenCalledWith({ drinking: 3, meals: 4, carbs: 7 });
  });

  it("exposes a points question's tooltip on its legend", () => {
    renderForm();
    expect(screen.getByText("פחמימות")).toHaveAttribute("title", "סכום הנקודות מכל הארוחות");
  });

  it("slider max extends when the floor exceeds the configured max", () => {
    renderForm({ ...zeroFloors, carbs: 35 });
    expect(screen.getByRole("slider")).toHaveAttribute("max", "35");
  });

  it("offers the tracked value as a choice when the floor tops every choice value", () => {
    const onSubmit = renderForm({ ...zeroFloors, meals: 5 });
    const tracked = screen.getByLabelText("5");
    expect(tracked).toBeEnabled();
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    fireEvent.click(tracked);
    fireEvent.click(screen.getByRole("button", { name: "שליחה" }));
    expect(onSubmit).toHaveBeenCalledWith({ drinking: 3, meals: 5, carbs: 0 });
  });

  it("warns that submitting again overwrites when the day is already recorded", () => {
    renderForm(zeroFloors, vi.fn(), { drinking: 3, meals: 4, carbs: 7 });
    expect(screen.getByText("היום הזה כבר נשלח — שליחה חוזרת תחליף את התשובות שנשמרו")).toBeInTheDocument();
  });

  it("checks the saved answers of a recorded day being edited", () => {
    renderForm(zeroFloors, vi.fn(), { drinking: 3, meals: 4, carbs: 7 });
    expect(screen.getByLabelText("3 ליטר")).toBeChecked();
    expect(screen.getByLabelText("מעל 3")).toBeChecked();
    expect(screen.getByRole("slider")).toHaveValue("7");
  });

  it("resubmits a recorded day unchanged", () => {
    const onSubmit = renderForm(zeroFloors, vi.fn(), { drinking: 3, meals: 4, carbs: 7 });
    fireEvent.click(screen.getByRole("button", { name: "שליחה" }));
    expect(onSubmit).toHaveBeenCalledWith({ drinking: 3, meals: 4, carbs: 7 });
  });

  it("seats a saved value no choice carries in scale order", () => {
    renderForm(zeroFloors, vi.fn(), { drinking: 3, meals: 2.5, carbs: 7 });
    expect(screen.getAllByRole("radio").map((radio) => radio.parentElement!.textContent!.trim()))
      .toEqual(["2.5 ליטר", "3 ליטר", "2 ארוחות", "2.5", "3 ארוחות", "מעל 3"]);
  });

  it("offers a saved value no choice carries as a checked option", () => {
    // A day closed from the tracker stores its computed figures, which need not land on the scale.
    const onSubmit = renderForm(zeroFloors, vi.fn(), { drinking: 3, meals: 2.5, carbs: 7 });
    expect(screen.getByLabelText("2.5")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "שליחה" }));
    expect(onSubmit).toHaveBeenCalledWith({ drinking: 3, meals: 2.5, carbs: 7 });
  });

  it("shows no overwrite warning for a day without a record", () => {
    renderForm();
    expect(screen.queryByText("היום הזה כבר נשלח — שליחה חוזרת תחליף את התשובות שנשמרו")).toBeNull();
  });

  it("checks nothing for a day without a record", () => {
    renderForm();
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
  });

  it("does not synthesize an extra choice while a real choice is still enabled", () => {
    renderForm({ ...zeroFloors, meals: 4 });
    // drinking has 2 radios and meals 3; a synthesized option would add a sixth.
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });

  it("reports unsaved edits to the owner of the fold and the day picker", () => {
    const onPendingChange = vi.fn();
    renderForm(zeroFloors, vi.fn(), undefined, onPendingChange);
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    expect(onPendingChange).toHaveBeenLastCalledWith(true);
  });

  it("reports nothing pending once the form is gone", () => {
    const onPendingChange = vi.fn();
    renderForm(zeroFloors, vi.fn(), undefined, onPendingChange);
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    cleanup();
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it("offers no discard on a form still holding what it opened on", () => {
    renderForm();
    expect(screen.queryByRole("button", { name: DISCARD_LABEL })).toBeNull();
  });

  it("offers to discard the edits once an answer changes", () => {
    renderForm();
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    expect(screen.getByRole("button", { name: DISCARD_LABEL })).toBeInTheDocument();
  });

  it("withdraws the discard when an edited answer returns to the saved one", () => {
    renderForm(zeroFloors, vi.fn(), { drinking: 3, meals: 4, carbs: 7 });
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "9" } });
    fireEvent.change(slider, { target: { value: "7" } });
    expect(screen.queryByRole("button", { name: DISCARD_LABEL })).toBeNull();
  });

  it("restores the answers the form opened on once the discard is confirmed", () => {
    confirmed = true;
    renderForm(zeroFloors, vi.fn(), { drinking: 3, meals: 4, carbs: 7 });
    fireEvent.click(screen.getByLabelText("2.5 ליטר"));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: DISCARD_LABEL }));
    expect(screen.getByLabelText("3 ליטר")).toBeChecked();
    expect(screen.getByRole("slider")).toHaveValue("7");
  });

  it("names the unanswered question in Hebrew instead of leaving it to the browser", () => {
    const onValidationError = vi.fn();
    const onSubmit = renderForm(zeroFloors, vi.fn(), undefined, vi.fn(), onValidationError);
    fireEvent.click(screen.getByLabelText("3 ליטר"));
    fireEvent.click(screen.getByRole("button", { name: "שליחה" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onValidationError).toHaveBeenCalledWith("יש לבחור תשובה לשאלה: ארוחות");
  });

  it("keeps the edits when the discard is declined", () => {
    confirmed = false;
    renderForm(zeroFloors, vi.fn(), { drinking: 3, meals: 4, carbs: 7 });
    fireEvent.change(screen.getByRole("slider"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: DISCARD_LABEL }));
    expect(screen.getByRole("slider")).toHaveValue("9");
    expect(screen.getByRole("button", { name: DISCARD_LABEL })).toBeInTheDocument();
  });
});
