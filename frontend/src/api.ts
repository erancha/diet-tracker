// Typed client for the authenticated backend API, bound to the signed-in user's tokens, plus the
// Hebrew alert text the UI shows when a request fails.

import { isUnexpired, reauthenticate, type Tokens } from "./auth";
import type { AppConfig } from "./config";
import type { AdminActivity, AnswerValue, ChatAnswer, ChatTranscript, ChatTurn, DayPayload,
  HistoryResponse, LoadedHistory, NewMeal, NotificationSettings, SubmitResult, WeightPayload } from "./types";

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
  getDays(): Promise<LoadedHistory>;
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
  setMuted(muted: boolean): Promise<NotificationSettings>;
  dismissUndelivered(at: string): Promise<{ at: string }>;
  getAdminActivity(): Promise<AdminActivity>;
  ask(question: string, at?: string, app?: boolean): Promise<ChatAnswer>;
  getChatTranscript(): Promise<ChatTranscript>;
  deleteChatTurn(at: string): Promise<{ at: string }>;
  summarizeChatTurn(at: string): Promise<ChatTurn>;
}

export function createApi(
  cfg: AppConfig,
  tokens: Tokens,
  onExpired: () => void = () => reauthenticate(cfg),
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
      onExpired();
      return new Promise<T>(() => {});
    }
    if (!response.ok) {
      throw new ApiError(response.status, `${method} ${path} → ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }
  return {
    // Timed end to end — network, token verification, Lambda start and the reads together — as
    // the wait the trend chart sits behind and labels itself with. A failed request reports
    // nothing: the figure only ever describes a completed load.
    getDays: async () => {
      const started = performance.now();
      const history = await request<HistoryResponse>("GET", "/days");
      const loadedInMs = Math.round(performance.now() - started);
      console.info(`GET /days ${loadedInMs} ms`);
      return { ...history, loadedInMs };
    },
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
    setMuted: (muted) => request("PUT", "/notifications", { muted }),
    // The timestamp travels percent-encoded for the same reason a chat turn's does: its '+' and
    // ':' must reach the route as the literal characters the message is stored under.
    dismissUndelivered: (at) => request("DELETE", `/undelivered/${encodeURIComponent(at)}`),
    getAdminActivity: () => request("GET", "/admin/activity"),
    // `at` marks the question as a follow-up: the server writes the answered question over the
    // turn stored under that timestamp, keeping the conversation as that one turn.
    // `app` marks a question the app composed rather than one the user typed; the stored chat
    // keeps the mark, and a follow-up has to repeat it because the server rewrites the chat whole.
    ask: (question, at, app) => request("POST", "/chat", {
      question,
      ...(at !== undefined && { at }),
      ...(app === true && { app }),
    }),
    getChatTranscript: () => request("GET", "/chat"),
    // The timestamp's '+' and ':' must reach the route as the literal characters the turn is
    // stored under, so it travels percent-encoded.
    deleteChatTurn: (at) => request("DELETE", `/chat/${encodeURIComponent(at)}`),
    // Returns the chat as the summary leaves it: the conversation's original question, the
    // digest as its answer, and the same timestamp it was already stored under.
    summarizeChatTurn: (at) => request("POST", `/chat/${encodeURIComponent(at)}/summary`),
  };
}
