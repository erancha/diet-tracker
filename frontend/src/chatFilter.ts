// The browser-remembered choice of which side of the chat transcript is listed: every chat, only
// the ones the user asked, only the ones the app wrote for them, or only the ones the user
// shared. Which chats each value admits is the chat's own call (components/Chat); here lives only
// the choice, persisting past the visit so the next sign-in opens on the side the filter last
// chose.

import { readStored, writeStored } from "./localStore";

export type ChatFilter = "all" | "mine" | "app" | "shared";

// Exported for tests that pin the side a case opens on.
export const STORAGE_KEY = "diet-tracker.chat-filter";

const FILTERS: ChatFilter[] = ["all", "mine", "app", "shared"];

// A stored value from an older release that no longer names a side reads as every chat.
export function storedChatFilter(): ChatFilter {
  const stored = readStored(STORAGE_KEY);
  return FILTERS.find((filter) => filter === stored) ?? "all";
}

export function storeChatFilter(filter: ChatFilter): void {
  writeStored(STORAGE_KEY, filter);
}
