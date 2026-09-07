import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, type Api } from "../api";
import { instantLabel } from "../dates";
import type { ChatSampleQuestion, ChatTurn } from "../types";
import { Icon } from "./Icon";
import { useGlobalFold } from "./useFoldAll";

// The server states the same refusal in handlers/chat.py; mirrored here because ApiError does
// not surface the response body (the appTitle.ts precedent for cross-runtime strings).
const QUOTA_MESSAGE = "מכסת השאלות היומית נוצלה — אפשר לשאול שוב מחר";

const ORIGINAL_LABEL = "השאלה המקורית:";
const ANSWER_LABEL = "התשובה:";
const FOLLOW_UP_LABEL = "שאלת המשך:";
const CHAIN_LABELS = [ORIGINAL_LABEL, ANSWER_LABEL, FOLLOW_UP_LABEL];

// A copy of the set with the timestamp added if absent, removed if present.
function flipped(current: Set<string>, at: string): Set<string> {
  const next = new Set(current);
  if (!next.delete(at)) next.add(at);
  return next;
}

function dropped(current: Set<string>, at: string): Set<string> {
  const next = new Set(current);
  next.delete(at);
  return next;
}

// A follow-up rides the same single-question API: the prior conversation is folded into the
// question text as a labeled chain. An already-chained stored question only appends the
// target's answer and the new question.
function composeFollowUp(target: ChatTurn, question: string): string {
  const chain = target.question.startsWith(ORIGINAL_LABEL)
    ? target.question
    : `${ORIGINAL_LABEL} ${target.question}`;
  return `${chain}\n${ANSWER_LABEL} ${target.answer}\n${FOLLOW_UP_LABEL} ${question}`;
}

// A chained question stays one plain string in storage; display bolds each chain label after a
// blank line (via the button's pre-wrap). Folded answers may span lines themselves, so only
// lines opening with a label start a section.
function renderQuestion(text: string): ReactNode {
  if (!text.startsWith(ORIGINAL_LABEL)) return text;
  return text.split("\n").map((line, index) => {
    const label = CHAIN_LABELS.find((candidate) => line.startsWith(candidate));
    return (
      <Fragment key={index}>
        {index > 0 && (label ? "\n\n" : "\n")}
        {label ? <strong>{label}</strong> : null}
        {label ? line.slice(label.length) : line}
      </Fragment>
    );
  });
}

// Q&A over the diet knowledge base: a composer on top of the user's stored transcript — newest
// first, one row per chat, behind a count-labeled previous-chats toggle. The menu's
// condensed/full command folds and unfolds the transcript, the condensed sign-in starts it
// folded, and sending a question always reveals it so the arriving answer never lands out of
// sight.
//
// The transcript loads once in full, so toggling a question, its sources, or the transcript
// reveals data already in memory. A fresh answer opens expanded — the user is
// waiting for it — while loaded chats start collapsed; each row is dated in the reader's local
// clock and offers deletion behind a confirm.
//
// An open answer's foot offers a reply control beside a closing one. The reply moves the
// composer under the answer: the follow-up is sent as the chat's labeled chain plus the new
// question, and the answered chat re-keys to the top of the transcript. Closing folds the chat
// from where reading ends and hands focus back to its question bubble. While a question is in
// flight the composer withdraws, leaving the sent question and the thinking indicator.
// Sample-question links above the composer only fill the input — no quota is spent before the
// user chooses to submit.
export function Chat({ api, sampleQuestions, defaultTranscriptFolded = false }: {
  api: Pick<Api, "ask" | "getChatTranscript" | "deleteChatTurn">;
  sampleQuestions: ChatSampleQuestion[];
  defaultTranscriptFolded?: boolean;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  // Timestamps of the chats whose answers are open.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Timestamps of the chats whose source citations are shown.
  const [sourcesShown, setSourcesShown] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  // The question awaiting its answer, or null. Doubles as the pending flag: the composer is
  // withdrawn while it is set, so at most one question is in flight.
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  // The chat the next question follows up on, or null for a standalone question.
  const [replyTo, setReplyTo] = useState<ChatTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcriptFolded, setTranscriptFolded] = useState(defaultTranscriptFolded);
  useGlobalFold(setTranscriptFolded);
  // Question buttons by timestamp, for handing focus back when a chat folds from its answer's
  // foot.
  const questionRefs = useRef(new Map<string, HTMLButtonElement>());

  // Sending withdraws the composer out from under the user's focus, so the thinking indicator
  // takes it: assistive tech announces the wait and the browser scrolls the indicator into view.
  const pendingRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (pendingQuestion !== null) pendingRef.current?.focus();
  }, [pendingQuestion]);

  useEffect(() => {
    api.getChatTranscript()
      .then((transcript) => setTurns(transcript.turns))
      .catch((thrown) => setError(`טעינת השיחה נכשלה (${(thrown as Error).message})`));
  }, [api]);

  const send = async () => {
    const question = draft.trim();
    if (!question) return;
    setDraft("");
    setError(null);
    setTranscriptFolded(false);
    setPendingQuestion(question);
    try {
      const asked = replyTo === null ? question : composeFollowUp(replyTo, question);
      const reply = replyTo === null ? await api.ask(asked) : await api.ask(asked, replyTo.at);
      const answered = { question: asked, answer: reply.answer, sources: reply.sources, at: reply.at };
      // Fresh or followed-up, the answered turn leads — the order the server returns on reload.
      setTurns((current) => [answered, ...current.filter((turn) => turn.at !== replyTo?.at)]);
      setExpanded((current) => new Set(current).add(reply.at));
      setReplyTo(null);
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
  // history table's per-row delete. The chat leaves the view only once the server confirms.
  const remove = async (turn: ChatTurn) => {
    if (!window.confirm("למחוק את השאלה והתשובה לצמיתות?")) return;
    setError(null);
    try {
      await api.deleteChatTurn(turn.at);
      setTurns((current) => current.filter((kept) => kept.at !== turn.at));
      setExpanded((current) => dropped(current, turn.at));
      setSourcesShown((current) => dropped(current, turn.at));
      setReplyTo((current) => (current?.at === turn.at ? null : current));
    } catch (thrown) {
      setError(`מחיקת השאלה נכשלה (${(thrown as Error).message})`);
    }
  };

  const toggle = (at: string) => setExpanded((current) => flipped(current, at));
  const toggleSources = (at: string) => setSourcesShown((current) => flipped(current, at));

  // Folding from the answer's foot would leave the reader mid-transcript, so focus moves to the
  // chat's question button — which also scrolls it back into view.
  const collapseFromFoot = (at: string) => {
    toggle(at);
    questionRefs.current.get(at)!.focus();
  };

  // The question awaiting its answer, rendered as a normal exchange with the thinking
  // indicator, following the composer so a pending follow-up reads under the answer it extends.
  const pendingExchange = pendingQuestion !== null && (
    <>
      <li className="chat-user"><p>{pendingQuestion}</p></li>
      <li className="chat-assistant"><p className="chat-pending" tabIndex={-1} ref={pendingRef}>חושב…</p></li>
    </>
  );

  const composer = (
    <>
      {replyTo && (
        <div className="reply-chip">
          <span>שאלת המשך</span>
          <button type="button" className="icon-only" aria-label="ביטול שאלת ההמשך"
            onClick={() => setReplyTo(null)}><Icon name="close" /></button>
        </div>
      )}
      <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <div className="composer">
          <textarea
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={replyTo === null ? "שאלה על סבא חטוב 👴…" : "שאלת המשך…"}
            aria-label="שאלה"
          />
          {draft !== "" && (
            <button type="button" className="icon-only clear-draft" aria-label="ניקוי השאלה"
              onClick={() => setDraft("")}><Icon name="close" /></button>
          )}
        </div>
        <button type="submit" disabled={draft.trim() === ""}>שליחה</button>
      </form>
    </>
  );

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
      {replyTo === null && pendingQuestion === null && composer}
      {error && <div className="alert">{error}</div>}
      {turns.length > 0 && (
        <button type="button" className="quiet transcript-toggle"
          aria-expanded={!transcriptFolded}
          onClick={() => setTranscriptFolded((folded) => !folded)}>
          {turns.length === 1 ? "צ'אט קודם אחד" : `${turns.length} צ'אטים קודמים`}
        </button>
      )}
      {(pendingQuestion !== null || (turns.length > 0 && !transcriptFolded)) && (
        <ul className="chat-messages">
          {replyTo === null && pendingExchange}
          {!transcriptFolded && turns.map((turn) => (
            <Fragment key={turn.at}>
              <li className="chat-user">
                <time className="chat-turn-at" dateTime={turn.at}>{instantLabel(turn.at)}</time>
                <button type="button" className="chat-question"
                  ref={(el) => {
                    if (el) questionRefs.current.set(turn.at, el);
                    else questionRefs.current.delete(turn.at);
                  }}
                  aria-expanded={expanded.has(turn.at)}
                  onClick={() => toggle(turn.at)}>{renderQuestion(turn.question)}</button>
                <button type="button" className="icon-only delete-turn"
                  aria-label={`מחיקת השאלה ${turn.question}`}
                  onClick={() => void remove(turn)}><Icon name="remove" /></button>
              </li>
              {expanded.has(turn.at) && (
                <li className="chat-assistant">
                  <p>{turn.answer}</p>
                  {turn.sources.length > 0 && (
                    <>
                      <button type="button" className="more-toggle"
                        aria-expanded={sourcesShown.has(turn.at)}
                        onClick={() => toggleSources(turn.at)}>
                        {sourcesShown.has(turn.at) ? "פחות" : "התאמות"}
                      </button>
                      {sourcesShown.has(turn.at) && (
                        <table className="chat-sources">
                          <thead>
                            <tr><th>מקור</th><th>התאמה</th></tr>
                          </thead>
                          <tbody>
                            {turn.sources.map((source, index) => (
                              <tr key={index}>
                                <td>{source.fileName}</td>
                                <td>{Math.round(source.score * 100)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </>
                  )}
                  <div className="answer-foot">
                    <button type="button" className="reply-turn"
                      aria-label={`שאלת המשך על ${turn.question}`}
                      aria-pressed={replyTo?.at === turn.at}
                      onClick={() => setReplyTo(turn)}>המשך</button>
                    <button type="button"
                      aria-label={`סגירת התשובה על ${turn.question}`}
                      onClick={() => collapseFromFoot(turn.at)}>סגירה</button>
                  </div>
                </li>
              )}
              {replyTo?.at === turn.at && (
                <>
                  {pendingQuestion === null && <li className="chat-composer">{composer}</li>}
                  {pendingExchange}
                </>
              )}
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}
