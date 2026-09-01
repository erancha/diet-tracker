import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DayPicker } from "./DayPicker";

describe("DayPicker", () => {
  const props = {
    todayStr: "2026-08-18",
    yesterdayStr: "2026-08-17",
    value: "yesterday" as const,
    dayEndHour: 20,
    onChange: () => {},
  };

  it("blocks today while the day is still running, naming the hour it opens", () => {
    render(<DayPicker {...props} todaySelectable={false} />);

    const today = screen.getByRole("radio", { name: /היום/ });
    expect(today).toBeDisabled();
    expect(today).toHaveAccessibleDescription(/20:00/);
    expect(screen.getByRole("radio", { name: /אתמול/ })).toBeEnabled();
  });

  it("opens today once the day has ended", () => {
    render(<DayPicker {...props} todaySelectable />);

    expect(screen.getByRole("radio", { name: /היום/ })).toBeEnabled();
  });
});
