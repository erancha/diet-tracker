import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Welcome } from "./Welcome";

describe("Welcome", () => {
  it("opens on a greeting and lists the three steps that start the tracking", () => {
    render(<Welcome />);

    expect(screen.getByRole("heading", { name: /ברוכים הבאים/ })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
