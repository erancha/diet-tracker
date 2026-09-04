import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Api } from "../api";
import { AdminSection } from "./AdminSection";

const LISTING = { users: [
  { email: "active@gmail.com", days: 5, meals: 12, chats: 7 },
  { email: "quiet@gmail.com", days: 0, meals: 0, chats: 0 },
] };

function api(): Pick<Api, "getAdminActivity"> {
  return { getAdminActivity: vi.fn().mockResolvedValue(LISTING) };
}

describe("AdminSection", () => {
  it("rests folded and asks the server nothing until opened", () => {
    const adminApi = api();
    render(<AdminSection api={adminApi} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(adminApi.getAdminActivity).not.toHaveBeenCalled();
  });

  it("lists every user with the week's counts in the server's order once opened", async () => {
    render(<AdminSection api={api()} />);
    await userEvent.click(screen.getByRole("button", { name: "פעילות משתמשים" }));
    const rows = await screen.findAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain("active@gmail.com");
    expect(rows[1].textContent).toContain("5");
    expect(rows[1].textContent).toContain("12");
    expect(rows[1].textContent).toContain("7");
    expect(rows[2].textContent).toContain("quiet@gmail.com");
  });

  it("surfaces a failed load instead of an empty listing", async () => {
    const adminApi = { getAdminActivity: vi.fn().mockRejectedValue(new Error("boom")) };
    render(<AdminSection api={adminApi} />);
    await userEvent.click(screen.getByRole("button", { name: "פעילות משתמשים" }));
    expect((await screen.findByText(/boom/)).textContent).toContain("טעינת הפעילות נכשלה");
  });
});
