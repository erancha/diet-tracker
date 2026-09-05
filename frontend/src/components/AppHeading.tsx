import { APP_TITLE } from "../appTitle";

/**
 * The page heading both screens share: the browser tab's salad icon — the same favicon.svg
 * asset, so the two cannot drift apart — beside the app name. The icon is decorative, so the
 * heading's accessible name stays the bare title.
 */
export function AppHeading() {
  return (
    <h1>
      <img className="app-icon" src="favicon.svg" alt="" /> {APP_TITLE}
    </h1>
  );
}
