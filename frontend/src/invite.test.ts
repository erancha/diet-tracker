import { describe, expect, it } from "vitest";
import { whatsAppInviteUrl } from "./invite";

const decodedText = (url: string) => {
  expect(url.startsWith("https://wa.me/?text=")).toBe(true);
  return decodeURIComponent(url.slice("https://wa.me/?text=".length));
};

describe("whatsAppInviteUrl", () => {
  it("opens with the sender as the app's developer for the admin account", () => {
    const text = decodedText(whatsAppInviteUrl(true));

    expect(text).toContain("פיתחתי");
    expect(text).not.toContain("קיבלתי המלצה");
  });

  it("opens with a received recommendation for everyone else", () => {
    const text = decodedText(whatsAppInviteUrl(false));

    expect(text).toContain("קיבלתי המלצה");
    expect(text).not.toContain("פיתחתי");
  });

  it("pitches the free app, the habits-over-calories focus and the AI assistant", () => {
    const text = decodedText(whatsAppInviteUrl(false));

    expect(text).toContain("חינמית");
    expect(text).toContain("קלוריות");
    expect(text).toContain("הרגלים");
    expect(text).toContain("AI");
  });

  it("closes with the app's own address on a line of its own, so WhatsApp previews the link", () => {
    const text = decodedText(whatsAppInviteUrl(false));

    expect(text.split("\n").at(-1)).toBe(window.location.origin);
  });

  it("sets the sign-up call apart from the pitch with a blank line", () => {
    const lines = decodedText(whatsAppInviteUrl(false)).split("\n");

    expect(lines.at(-3)).toBe("");
    expect(lines.at(-2)).toContain("נרשמים בחינם");
  });
});
