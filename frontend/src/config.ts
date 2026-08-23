// Runtime configuration injected by public/config.js (generated per environment by
// scripts/deploy.sh), loaded as a plain script before the app bundle so a rebuild is never
// needed to retarget an environment.

export interface AppConfig {
  cognitoDomain: string;
  clientId: string;
  apiUrl: string;
  redirectUri: string;
  // App owner's address, shown to rejected sign-ins as the contact for requesting access.
  rootEmail: string;
  // First hour (local) of the stack's daily fill reminders; from then on an untracked,
  // unsubmitted day opens the day-end questionnaire expanded.
  firstReminderHour: number;
  // First hour (local) at which the day tracker opens expanded on a day with no recorded
  // meals; once a meal exists, the tracker's own between-meals gap governs instead.
  trackerStartHour: number;
}

declare global {
  interface Window {
    CONFIG: AppConfig;
  }
}

export function getConfig(): AppConfig {
  return window.CONFIG;
}
