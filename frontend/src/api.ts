// Typed client for the authenticated backend API, bound to the signed-in user's tokens.

import type { Tokens } from "./auth";
import type { AppConfig } from "./config";
import type { AnswerValue, DayPayload, HistoryResponse, NewMeal, SubmitResult } from "./types";

export interface SubmitPayload {
  answers: Record<string, AnswerValue>;
  date: string;
}

export interface Api {
  getDays(): Promise<HistoryResponse>;
  submitDay(payload: SubmitPayload): Promise<SubmitResult>;
  deleteDay(date: string): Promise<{ date: string }>;
  addMeal(meal: NewMeal): Promise<DayPayload>;
  deleteMeal(date: string, id: string): Promise<DayPayload>;
}

export function createApi(cfg: AppConfig, tokens: Tokens): Api {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(cfg.apiUrl + path, {
      method,
      headers: {
        Authorization: `Bearer ${tokens.id_token}`,
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${await response.text()}`);
    return response.json();
  }
  return {
    getDays: () => request("GET", "/days"),
    submitDay: (payload) => request("POST", "/days", payload),
    deleteDay: (date) => request("DELETE", `/days/${date}`),
    addMeal: (meal) => request("POST", "/meals", meal),
    deleteMeal: (date, id) => request("DELETE", `/meals/${date}/${id}`),
  };
}
