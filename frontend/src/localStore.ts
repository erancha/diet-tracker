// Site data behind the browser's own guard. Reading and writing throws outright where the browser
// is set to block it, which is a state the app is served into rather than a fault: a value then
// lives for the session alone, and a read comes back empty.

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Nothing to fall back to: the value simply does not outlive the tab.
  }
}
