import { afterEach, describe, expect, it } from "vitest";
import { storeCondensedView, storedCondensedView } from "./viewMode";

describe("condensed view persistence", () => {
  afterEach(() => window.localStorage.clear());

  it("opens a first visit on the condensed view", () => {
    expect(storedCondensedView()).toBe(true);
  });

  it("hands the chosen view to the next visit", () => {
    storeCondensedView(true);
    expect(storedCondensedView()).toBe(true);

    storeCondensedView(false);
    expect(storedCondensedView()).toBe(false);
  });
});
