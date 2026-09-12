// The browser-remembered size of the others'-chats list as of the last visit, so the chat can
// tell a count that grew since — chats the reader has not seen — from one that stood still.
// Kept per signed-in address, so accounts sharing a browser keep their own last visit.

import { readStored, writeStored } from "./localStore";

// Exported for tests that pin what an account's last visit saw.
export const storageKey = (email: string) => `diet-tracker.public-chat-count.${email}`;

// Null on a first visit, or where the stored value is not a number.
export function storedPublicCount(email: string): number | null {
  const stored = readStored(storageKey(email));
  if (stored === null) return null;
  const count = Number(stored);
  return Number.isInteger(count) ? count : null;
}

export function storePublicCount(email: string, count: number): void {
  writeStored(storageKey(email), String(count));
}
