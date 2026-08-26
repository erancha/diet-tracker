import { describe, expect, it, vi } from "vitest";
import { DISCARD_EDITS_PROMPT, mayDiscardEdits } from "./edits";

describe("mayDiscardEdits", () => {
  it("discards an untouched form without asking", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(mayDiscardEdits(false)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("discards pending edits once the user confirms", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    expect(mayDiscardEdits(true)).toBe(true);
    expect(confirm).toHaveBeenCalledWith(DISCARD_EDITS_PROMPT);
    confirm.mockRestore();
  });

  it("keeps pending edits when the user declines", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(mayDiscardEdits(true)).toBe(false);
    confirm.mockRestore();
  });
});
