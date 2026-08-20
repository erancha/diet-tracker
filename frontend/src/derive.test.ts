// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveDay } from "./derive";

// The same vectors pin src/common/derive.py — reading the file keeps one fixture for both
// runtimes without import-path acrobatics.
const fixture = JSON.parse(
  readFileSync(new URL("../../config/derive-vectors.json", import.meta.url), "utf-8"));

describe("deriveDay", () => {
  for (const vector of fixture.vectors) {
    it(vector.name, () => {
      expect(deriveDay(vector.meals, fixture.weights)).toEqual(vector.derived);
    });
  }
});
