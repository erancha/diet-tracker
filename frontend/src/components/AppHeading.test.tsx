import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppHeading } from "./AppHeading";
import { APP_TITLE } from "../appTitle";

describe("AppHeading", () => {
  it("names the build's version and date under the title, leaving the heading's name bare", () => {
    render(<AppHeading />);
    expect(screen.getByRole("heading", { name: APP_TITLE })).toBeInTheDocument();
    expect(
      screen.getByText(`גירסה ${__APP_VERSION__}, ${__APP_COMMIT_DATE__}`)
    ).toBeInTheDocument();
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+$/);
    expect(__APP_COMMIT_DATE__).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});
