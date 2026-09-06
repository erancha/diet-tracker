import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Api } from "../api";
import { AdminSection } from "./AdminSection";

const LISTING = { users: [
  { email: "active@gmail.com", days: 5, meals: 12, chats: 7, weights: 4, target: true },
  { email: "quiet@gmail.com", days: 0, meals: 0, chats: 0, weights: 0, target: false },
] };

function api(): Pick<Api, "getAdminActivity"> {
  return { getAdminActivity: vi.fn().mockResolvedValue(LISTING) };
}

describe("AdminSection", () => {
  it("opens expanded, loading the listing at once", async () => {
    render(<AdminSection api={api()} />);
    expect(await screen.findAllByRole("listitem")).toHaveLength(2);
  });

  it("cards every user with the week's titled counts in the server's order", async () => {
    render(<AdminSection api={api()} />);
    const cards = await screen.findAllByRole("listitem");
    expect(cards[0].textContent).toContain("active@gmail.com");
    expect(cards[0].textContent).toContain("ימים שנסגרו5");
    expect(cards[0].textContent).toContain("ארוחות12");
    expect(cards[0].textContent).toContain("שאלות7");
    expect(cards[0].textContent).toContain("שקילות סה״כ4");
    expect(cards[1].textContent).toContain("quiet@gmail.com");
  });

  it("marks a set target with a check and never the kilograms", async () => {
    render(<AdminSection api={api()} />);
    const cards = await screen.findAllByRole("listitem");
    expect(cards[0].textContent).toContain("משקל יעד✅");
    expect(cards[1].textContent).toContain("משקל יעד—");
  });

  it("folds behind its own toggle and asks the server nothing more", async () => {
    const adminApi = api();
    render(<AdminSection api={adminApi} />);
    await screen.findAllByRole("listitem");
    await userEvent.click(screen.getByRole("button", { name: "פעילות משתמשים" }));
    expect(screen.queryByRole("list")).toBeNull();
    expect(adminApi.getAdminActivity).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failed load instead of an empty listing", async () => {
    const adminApi = { getAdminActivity: vi.fn().mockRejectedValue(new Error("boom")) };
    render(<AdminSection api={adminApi} />);
    expect((await screen.findByText(/boom/)).textContent).toContain("טעינת הפעילות נכשלה");
  });
});
