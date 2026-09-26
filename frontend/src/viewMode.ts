// The browser-remembered choice between the two page views — condensed or full. Which section
// states each view imposes is the screen's own call; here lives only the choice, persisting past
// the visit so the next sign-in opens on the view the menu last chose. Until a press chooses,
// the page opens condensed.

import { readStored, STORAGE_PREFIX, writeStored } from "./localStore";

// Exported for tests that pin the view a case opens on.
export const STORAGE_KEY = `${STORAGE_PREFIX}condensed-view`;

export function storedCondensedView(): boolean {
  return readStored(STORAGE_KEY) !== "false";
}

export function storeCondensedView(condensed: boolean): void {
  writeStored(STORAGE_KEY, String(condensed));
}
