import { APP_TITLE } from "../appTitle";

/**
 * The page heading both screens share: the browser tab's salad icon — the same favicon.svg
 * asset, so the two cannot drift apart — beside the app name, with the build's version and the
 * date of its last commit in small type under it. The icon is decorative and that line is a
 * sibling of the heading, so the heading's accessible name stays the bare title.
 */
export function AppHeading() {
  return (
    <div className="app-heading">
      <h1>
        <img className="app-icon" src="favicon.svg" alt="" /> {APP_TITLE}
      </h1>
      <p className="app-version">
        גירסה {__APP_VERSION__}, {__APP_COMMIT_DATE__}
      </p>
    </div>
  );
}
