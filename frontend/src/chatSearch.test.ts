import { describe, expect, it } from "vitest";
import { chatMatches } from "./chatSearch";

describe("chat text search", () => {
  it("admits every chat while the query holds no term", () => {
    expect(chatMatches("", "חלבון")).toBe(true);
    expect(chatMatches("   ", "חלבון")).toBe(true);
    expect(chatMatches("&|&", "חלבון")).toBe(true);
  });

  it("matches a single word anywhere in the searched text", () => {
    expect(chatMatches("חלבון", "כמה חלבון ביום?")).toBe(true);
    expect(chatMatches("שומן", "כמה חלבון ביום?")).toBe(false);
  });

  it("searches every text it is given, not only the first", () => {
    expect(chatMatches("שומן", "כמה חלבון ביום?", "שרפת שומן דורשת חלון אכילה")).toBe(true);
  });

  it("admits a chat holding any alternative of a | query", () => {
    expect(chatMatches("שינה | שומן", "שרפת שומן")).toBe(true);
    expect(chatMatches("שינה | שומן", "שעות שינה")).toBe(true);
    expect(chatMatches("שינה | שומן", "כמה חלבון?")).toBe(false);
  });

  it("demands every term of an & query", () => {
    expect(chatMatches("חלבון & שומן", "חלבון מול שומן")).toBe(true);
    expect(chatMatches("חלבון & שומן", "רק חלבון")).toBe(false);
  });

  it("binds & tighter than |", () => {
    expect(chatMatches("חלבון & שומן | שינה", "שעות שינה")).toBe(true);
    expect(chatMatches("חלבון & שומן | שינה", "חלבון מול שומן")).toBe(true);
    expect(chatMatches("חלבון & שומן | שינה", "רק חלבון")).toBe(false);
  });

  it("ignores the spacing around a term", () => {
    expect(chatMatches("  חלבון   &   שומן  ", "חלבון מול שומן")).toBe(true);
  });

  it("drops a blank term rather than letting it admit everything", () => {
    expect(chatMatches("חלבון & ", "רק שומן")).toBe(false);
    expect(chatMatches("| חלבון", "רק שומן")).toBe(false);
  });

  it("matches Latin text regardless of case on either side", () => {
    expect(chatMatches("keto", "What about KETO?")).toBe(true);
    expect(chatMatches("KETO", "what about keto?")).toBe(true);
  });
});
