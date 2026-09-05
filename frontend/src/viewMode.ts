// The browser-remembered choice between the two page views — condensed or full. Which section
// states each view imposes is the screen's own call (components/App); here lives only the
// choice, persisting past the visit so the next sign-in opens on the view the menu last chose.
// Until a press chooses, the page opens condensed.

// Exported for tests that pin the view a case opens on.
export const STORAGE_KEY = "diet-tracker.condensed-view";

// Reading and writing site data throws outright where the browser is set to block it, which is a
// state the app is served into rather than a fault: the view then lives for the session alone.
export function storedCondensedView(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function storeCondensedView(condensed: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(condensed));
  } catch {
    // Nothing to fall back to: the choice simply does not outlive the tab.
  }
}
