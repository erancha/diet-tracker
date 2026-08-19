// Typed client for the authenticated backend API, bound to the signed-in user's tokens.

import type { Tokens } from "./auth";
import type { AppConfig } from "./config";
import type { AnswerValue, HistoryResponse, SubmitResult } from "./types";

export interface SubmitPayload {
  answers: Record<string, AnswerValue>;
  date: string;
}

export interface Api {
  getHistory(): Promise<HistoryResponse>;
  submitAnswers(payload: SubmitPayload): Promise<SubmitResult>;
  deleteAnswers(date: string): Promise<{ date: string }>;
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
    getHistory: () => request("GET", "/answers"),
    submitAnswers: (payload) => request("POST", "/answers", payload),
    deleteAnswers: (date) => request("DELETE", `/answers/${date}`),
  };
}
