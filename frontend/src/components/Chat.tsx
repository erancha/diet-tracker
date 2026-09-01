import { Fragment, useEffect, useState } from "react";
import { ApiError, type Api } from "../api";
import type { ChatSampleQuestion, ChatTurn } from "../types";
import { Icon } from "./Icon";

// The server states the same refusal in handlers/chat.py; mirrored here because ApiError does
// not surface the response body (the appTitle.ts precedent for cross-runtime strings).
const QUOTA_MESSAGE = "מכסת השאלות היומית נוצלה — אפשר לשאול שוב מחר";

// Q&A over the diet knowledge base: the composer on top, then the user's whole stored
// transcript newest first as one question per row, each answer and its source chips folded
// behind its question. GET /chat delivers every turn in full up front, so toggling a question
// only reveals data already in memory — no request leaves the page per click. A fresh answer
// opens expanded — the user just asked and is waiting for it — while loaded turns start
// collapsed, which is what lets the full history render without a turn-count picker. Each turn
// offers permanent deletion behind a confirm, keyed by the timestamp the server stored it under.
// Configured sample questions render as one-tap links above the composer; a tap only fills the
// input — nothing is sent, so no quota is spent before the user chooses to submit.
export function Chat({ api, sampleQuestions }: {
  api: Pick<Api, "ask" | "getChatTranscript" | "deleteChatTurn">;
  sampleQuestions: ChatSampleQuestion[];
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  // Timestamps of the turns whose answers are open.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  // The question awaiting its answer, or null. Doubles as the pending flag: the composer is
  // held while it is set, so at most one question is in flight.
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getChatTranscript()
      .then((transcript) => setTurns(transcript.turns))
      .catch((thrown) => setError(`טעינת השיחה נכשלה (${(thrown as Error).message})`));
  }, [api]);

  const send = async () => {
    const question = draft.trim();
    if (!question || pendingQuestion !== null) return;
    setDraft("");
    setError(null);
    setPendingQuestion(question);
    try {
      const reply = await api.ask(question);
      setTurns((current) => [{ question, answer: reply.answer, sources: reply.sources, at: reply.at },
                             ...current]);
      setExpanded((current) => new Set(current).add(reply.at));
    } catch (thrown) {
      const failure = thrown as Error;
      setError(failure instanceof ApiError && failure.status === 429
        ? QUOTA_MESSAGE
        : `השאלה נכשלה (${failure.message})`);
    } finally {
      setPendingQuestion(null);
    }
  };

  // Deletion is permanent — no undo — so it stands behind the same confirm dialog as the
  // history table's per-row delete. The turn leaves the view only once the server confirms.
  const remove = async (turn: ChatTurn) => {
    if (!window.confirm("למחוק את השאלה והתשובה לצמיתות?")) return;
    setError(null);
    try {
      await api.deleteChatTurn(turn.at);
      setTurns((current) => current.filter((kept) => kept.at !== turn.at));
      setExpanded((current) => {
        const kept = new Set(current);
        kept.delete(turn.at);
        return kept;
      });
    } catch (thrown) {
      setError(`מחיקת השאלה נכשלה (${(thrown as Error).message})`);
    }
  };

  const toggle = (at: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(at)) next.add(at);
      return next;
    });
  };

  return (
    <div className="chat">
      {sampleQuestions.length > 0 && (
        <div className="chat-samples">
          {sampleQuestions.map((sample) => (
            <button key={sample.label} type="button" className="quiet"
              onClick={() => setDraft(sample.question)}>{sample.label}</button>
          ))}
        </div>
      )}
      <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <div className="composer">
          <textarea
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="שאלה על אבא חטוב…"
            aria-label="שאלה"
          />
          {draft !== "" && (
            <button type="button" className="icon-only clear-draft" aria-label="ניקוי השאלה"
              onClick={() => setDraft("")}><Icon name="close" /></button>
          )}
        </div>
        <button type="submit" disabled={pendingQuestion !== null || draft.trim() === ""}>שליחה</button>
      </form>
      {error && <div className="alert">{error}</div>}
      {(pendingQuestion !== null || turns.length > 0) && (
        <ul className="chat-messages">
          {pendingQuestion !== null && (
            <>
              <li className="chat-user"><p>{pendingQuestion}</p></li>
              <li className="chat-assistant"><p className="chat-pending">חושב…</p></li>
            </>
          )}
          {turns.map((turn) => (
            <Fragment key={turn.at}>
              <li className="chat-user">
                <button type="button" className="chat-question"
                  aria-expanded={expanded.has(turn.at)}
                  onClick={() => toggle(turn.at)}>{turn.question}</button>
                <button type="button" className="icon-only delete-turn"
                  aria-label={`מחיקת השאלה ${turn.question}`}
                  onClick={() => void remove(turn)}><Icon name="remove" /></button>
              </li>
              {expanded.has(turn.at) && (
                <li className="chat-assistant">
                  <p>{turn.answer}</p>
                  {turn.sources.length > 0 && (
                    <p className="chat-sources">
                      {turn.sources.map((source) => `${source.fileName} (${source.score.toFixed(2)})`).join(" · ")}
                    </p>
                  )}
                </li>
              )}
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}
