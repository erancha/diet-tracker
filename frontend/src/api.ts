// Typed client for the authenticated backend API, bound to the signed-in user's tokens, plus the
// Hebrew alert text the UI shows when a request fails.

import { isUnexpired, redirectToLogin, type Tokens } from "./auth";
import type { AppConfig } from "./config";
import type { AnswerValue, DayPayload, HistoryResponse, NewMeal, SubmitResult, WeightPayload } from "./types";

/** Backend request rejected; the message keeps the method, path, status, and body for diagnosis. */
export class ApiError extends Error {
  constructor(readonly status: number, detail: string) {
    super(detail);
  }
}

/**
 * Builds the Hebrew alert text for a failed action. The already-submitted conflict (409) is the
 * one API error a legitimate user can hit — a second tab or device closed the day first — so it
 * gets a fully Hebrew explanation; anything else is unexpected, so a Hebrew lead names the failed
 * action and the technical detail follows for diagnosis.
 */
export function alertMessage(action: string, error: Error): string {
  return error instanceof ApiError && error.status === 409
    ? "היום הזה כבר נשלח — יש לרענן את הדף"
    : `${action} (${error.message})`;
}

export interface SubmitPayload {
  answers: Record<string, AnswerValue>;
  date: string;
}

export interface Api {
  getDays(): Promise<HistoryResponse>;
  getDay(date: string): Promise<DayPayload>;
  submitDay(payload: SubmitPayload): Promise<SubmitResult>;
  deleteDay(date: string): Promise<{ date: string }>;
  addMeal(meal: NewMeal): Promise<DayPayload>;
  updateMeal(date: string, id: string, meal: NewMeal): Promise<DayPayload>;
  deleteMeal(date: string, id: string): Promise<DayPayload>;
  getWeight(): Promise<WeightPayload>;
  recordWeight(kg: number): Promise<WeightPayload>;
  setWeightTarget(kg: number): Promise<WeightPayload>;
  deleteWeight(date: string): Promise<WeightPayload>;
}

export function createApi(
  cfg: AppConfig,
  tokens: Tokens,
  reauthenticate: () => void = () => void redirectToLogin(cfg),
): Api {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(cfg.apiUrl + path, {
      method,
      headers: {
        Authorization: `Bearer ${tokens.id_token}`,
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // The captured token has outlived its validity (the tab stayed open past expiry). The Cognito
    // Hosted UI session cookie outlasts the ID token, so re-running the login redirect usually
    // completes silently and lands back with a fresh token. The promise never settles: the page is
    // navigating away, and rejecting would flash an error alert during the redirect.
    //
    // A 401 on a token still inside its lifetime is a different fault: the API rejects a token this
    // client considers good, as when the stack is redeployed under a new user pool while an older
    // config.js is still cached. Signing in again would only produce another rejected token, so
    // that case falls through to the error below instead of cycling through the Hosted UI forever.
    if (response.status === 401 && !isUnexpired(tokens)) {
      sessionStorage.removeItem("tokens");
      reauthenticate();
      return new Promise<T>(() => {});
    }
    if (!response.ok) {
      throw new ApiError(response.status, `${method} ${path} → ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }
  return {
    getDays: () => request("GET", "/days"),
    getDay: (date) => request("GET", `/days/${date}`),
    submitDay: (payload) => request("POST", "/days", payload),
    deleteDay: (date) => request("DELETE", `/days/${date}`),
    addMeal: (meal) => request("POST", "/meals", meal),
    updateMeal: (date, id, meal) => request("PUT", `/meals/${date}/${id}`, meal),
    deleteMeal: (date, id) => request("DELETE", `/meals/${date}/${id}`),
    getWeight: () => request("GET", "/weight"),
    recordWeight: (kg) => request("PUT", "/weight", { kg }),
    setWeightTarget: (kg) => request("PUT", "/weight/target", { kg }),
    deleteWeight: (date) => request("DELETE", `/weight/${date}`),
  };
}
