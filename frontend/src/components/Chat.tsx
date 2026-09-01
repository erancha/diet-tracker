import { Fragment, useEffect, useState } from "react";
import { ApiError, type Api } from "../api";
import type { ChatTurn } from "../types";
import { Icon } from "./Icon";

// The server states the same refusal in handlers/chat.py; mirrored here because ApiError does
// not surface the response body (the appTitle.ts precedent for cross-runtime strings).
const QUOTA_MESSAGE = "מכסת השאלות היומית נוצלה — אפשר לשאול שוב מחר";

// Turn counts the reader can choose between, narrowest first; null shows the whole transcript.
const LIMITS = [10, 20, null] as const;
type Limit = (typeof LIMITS)[number];

function within(turns: ChatTurn[], limit: Limit): ChatTurn[] {
  return limit === null ? turns : turns.slice(0, limit);
}

// A wider limit is offered only where the transcript reaches past every limit already on offer:
// one that would redraw the same turns is a control that appears to do nothing (the
// HistoryTable range picker's rule).
function offeredLimits(turns: ChatTurn[]): Limit[] {
  const [narrowest, ...wider] = LIMITS;
  const offered: Limit[] = [narrowest];
  let widest = within(turns, narrowest).length;
  for (const limit of wider) {
    const reach = within(turns, limit).length;
    if (reach > widest) {
      offered.push(limit);
      widest = reach;
    }
  }
  return offered;
}

function LimitPicker({ limits, value, onChange }: {
  limits: Limit[]; value: Limit; onChange: (value: Limit) => void;
}) {
  // A lone limit is no choice to make, so the row of controls goes rather than standing there
  // permanently checked.
  if (limits.length < 2) return null;
  return (
    <div className="range-picker">
      הצגה:
      {limits.map((limit) => (
        <label key={String(limit)}>
          <input type="radio" name="chat-limit" checked={value === limit}
                 onChange={() => onChange(limit)} />
          {" "}{limit === null ? "הכל" : limit}
        </label>
      ))}
    </div>
  );
}

// Q&A over the diet knowledge base: the composer on top, then the user's stored transcript
// newest first, with per-answer source chips. Turns come from GET /chat on open and each new
// answer joins the top, so the conversation survives reloads and follows the user across
// devices. Each turn offers permanent deletion behind a confirm, keyed by the timestamp the
// server stored it under.
export function Chat({ api }: { api: Pick<Api, "ask" | "getChatTranscript" | "deleteChatTurn"> }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [limit, setLimit] = useState<Limit>(LIMITS[0]);
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
    } catch (thrown) {
      setError(`מחיקת השאלה נכשלה (${(thrown as Error).message})`);
    }
  };

  const visible = within(turns, limit);
  return (
    <div className="chat">
      <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="שאלה על אבא חטוב…"
          aria-label="שאלה"
        />
        <button type="submit" disabled={pendingQuestion !== null}>שליחה</button>
      </form>
      {error && <div className="alert">{error}</div>}
      <LimitPicker limits={offeredLimits(turns)} value={limit} onChange={setLimit} />
      {(pendingQuestion !== null || visible.length > 0) && (
        <ul className="chat-messages">
          {pendingQuestion !== null && (
            <>
              <li className="chat-user"><p>{pendingQuestion}</p></li>
              <li className="chat-assistant"><p className="chat-pending">חושב…</p></li>
            </>
          )}
          {visible.map((turn) => (
            <Fragment key={turn.at}>
              <li className="chat-user">
                <p>{turn.question}</p>
                <button type="button" className="icon-only delete-turn"
                  aria-label={`מחיקת השאלה ${turn.question}`}
                  onClick={() => void remove(turn)}><Icon name="remove" /></button>
              </li>
              <li className="chat-assistant">
                <p>{turn.answer}</p>
                {turn.sources.length > 0 && (
                  <p className="chat-sources">
                    {turn.sources.map((source) => `${source.fileName} (${source.score.toFixed(2)})`).join(" · ")}
                  </p>
                )}
              </li>
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}
