import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuestionnaireForm } from "./QuestionnaireForm";
import type { Derived, Questionnaire } from "../types";

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

function renderForm(floors: Derived = zeroFloors, onSubmit = vi.fn()) {
  render(<QuestionnaireForm questionnaire={questionnaire} floors={floors}
                            onSubmit={onSubmit} onValidationError={vi.fn()} />);
  return onSubmit;
}

describe("QuestionnaireForm", () => {
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

  it("does not synthesize an extra choice while a real choice is still enabled", () => {
    renderForm({ ...zeroFloors, meals: 4 });
    // drinking has 2 radios and meals 3; a synthesized option would add a sixth.
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });
});
