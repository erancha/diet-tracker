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
  // Local hour by which the day's first meal is expected; from then on a day with nothing recorded
  // blinks the tracker's add-meal toggle.
  firstMealHour: number;
  // Hours a day may go without a meal before the next one counts as overdue; once the most recent
  // recorded meal is this far behind the clock, the tracker's add-meal toggle blinks.
  mealGapHours: number;
}

declare global {
  interface Window {
    CONFIG: AppConfig;
  }
}

export function getConfig(): AppConfig {
  return window.CONFIG;
}
