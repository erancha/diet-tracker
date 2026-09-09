// The browser-remembered choice of which side of the chat transcript is listed: every chat, only
// the ones the user asked, or only the ones the app wrote for them. Which chats each value
// admits is the chat's own call (components/Chat); here lives only the choice, persisting past
// the visit so the next sign-in opens on the side the filter last chose.

export type ChatFilter = "all" | "mine" | "app";

// Exported for tests that pin the side a case opens on.
export const STORAGE_KEY = "diet-tracker.chat-filter";

const FILTERS: ChatFilter[] = ["all", "mine", "app"];

// Reading and writing site data throws outright where the browser is set to block it, which is a
// state the app is served into rather than a fault: the choice then lives for the session alone.
// A stored value from an older release that no longer names a side falls back the same way.
export function storedChatFilter(): ChatFilter {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return FILTERS.find((filter) => filter === stored) ?? "all";
  } catch {
    return "all";
  }
}

export function storeChatFilter(filter: ChatFilter): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, filter);
  } catch {
    // Nothing to fall back to: the choice simply does not outlive the tab.
  }
}
