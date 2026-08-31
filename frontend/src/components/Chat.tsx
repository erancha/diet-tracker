import { useState } from "react";
import { ApiError, type Api } from "../api";
import type { ChatAnswer } from "../types";

// The server states the same refusal in handlers/chat.py; mirrored here because ApiError does
// not surface the response body (the appTitle.ts precedent for cross-runtime strings).
const QUOTA_MESSAGE = "מכסת השאלות היומית נוצלה — אפשר לשאול שוב מחר";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  sources?: ChatAnswer["sources"];
}

// Q&A over the diet knowledge base: a local message list, a composer, and per-answer source
// chips. The conversation lives only in this component's state — the server keeps no history.
export function Chat({ api }: { api: Pick<Api, "ask"> }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const question = draft.trim();
    if (!question || pending) return;
    setMessages((current) => [...current, { role: "user", text: question }]);
    setDraft("");
    setError(null);
    setPending(true);
    try {
      const reply = await api.ask(question);
      setMessages((current) => [...current, { role: "assistant", text: reply.answer, sources: reply.sources }]);
    } catch (thrown) {
      const failure = thrown as Error;
      setError(failure instanceof ApiError && failure.status === 429
        ? QUOTA_MESSAGE
        : `השאלה נכשלה (${failure.message})`);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="chat">
      {messages.length > 0 && (
        <ul className="chat-messages">
          {messages.map((message, index) => (
            <li key={index} className={`chat-${message.role}`}>
              <p>{message.text}</p>
              {message.sources && message.sources.length > 0 && (
                <p className="chat-sources">
                  {message.sources.map((source) => `${source.fileName} (${source.score.toFixed(2)})`).join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {pending && <p className="chat-pending">חושב…</p>}
      {error && <div className="alert">{error}</div>}
      <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="שאלה על אבא חטוב…"
          aria-label="שאלה"
        />
        <button type="submit" disabled={pending}>שליחה</button>
      </form>
    </div>
  );
}
