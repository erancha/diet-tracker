import { Fragment, useEffect, useRef, useState } from "react";
import { ApiError, type Api } from "../api";
import { ANSWER_LABEL, FOLLOW_UP_LABEL, ORIGINAL_LABEL, renderQuestion } from "../chatChain";
import { storeChatFilter, storedChatFilter, type ChatFilter } from "../chatFilter";
import { storePublicCount, storedPublicCount } from "../publicCount";
import { instantLabel } from "../dates";
import { dropped, flipped } from "../setToggle";
import type { ChatCount, ChatSampleQuestion, ChatTurn, PublicChat } from "../types";
import { ChatAnswer } from "./ChatAnswer";
import { Icon } from "./Icon";
import { PublicChatList } from "./PublicChats";
import { useGlobalFold } from "./useFoldAll";

// The server states the same refusal in handlers/chat.py; mirrored here because ApiError does
// not surface the response body (the appTitle.ts precedent for cross-runtime strings).
const QUOTA_MESSAGE = "מכסת השאלות היומית נוצלה — אפשר לשאול שוב מחר";

// What the two controls under an answer do, which their labels name but do not explain: a
// follow-up carries this chat's question and answer up with it, and summarizing is a one-way
// trade of the conversation for a digest of it — chat_history.summarize drops the chain, the
// follow-ups and the citations for good.
const FOLLOW_UP_HINT =
  "שאלה נוספת על אותה שיחה — היא נשלחת יחד עם השאלה והתשובה שכאן, כדי שהתשובה תמשיך אותן.";
const SUMMARIZE_HINT =
  "החלפת השיחה בסיכום קצר של מה שנשאל והוסק. השאלות, התשובות והמקורות שבה נמחקים ולא ניתן לשחזר אותם.";
// Sharing is read by name, and the answer may cite the asker's own tracked data — the choice the
// confirm spells out before anything leaves the asker's transcript.
const SHARE_CONFIRM =
  "לשתף את הצ'אט עם כל המשתמשים? הם יראו את השאלה, התשובה וכתובת המייל שלך. "
  + "אפשר לבטל את השיתוף בכל עת.";

// A follow-up rides the same single-question API: the prior conversation is folded into the
// question text as a labeled chain. An already-chained stored question only appends the
// target's answer and the new question.
function composeFollowUp(target: ChatTurn, question: string): string {
  const chain = target.question.startsWith(ORIGINAL_LABEL)
    ? target.question
    : `${ORIGINAL_LABEL} ${target.question}`;
  return `${chain}\n${ANSWER_LABEL} ${target.answer}\n${FOLLOW_UP_LABEL} ${question}`;
}

// Q&A over the diet knowledge base: a composer over the user's stored transcript, newest first,
// behind a count-labeled toggle with a filter beside it — every chat, only the ones the user
// asked, or only the ones the app wrote — the count following the filter and a held-back count
// beside it. Below the transcript a toggle of the same kind unfolds what other users shared,
// read-only. Only the counts are read on mount; either list is fetched once first unfolded, so
// the folded condensed sign-in never pays for a transcript nobody opens, and the counts stand
// in for the lists until then. The others' count is highlighted when it grew since the last
// visit (publicCount), until the list is unfolded. The filter choice outlives the visit
// (chatFilter);
// an arriving answer widens it back to every chat. The menu's condensed/full command folds the
// transcript, the condensed sign-in starts it folded, and sending always reveals it. Folding
// either list closes every answer open in it, so it reopens with only the questions in view. A
// question commanded from elsewhere (askCommand) is sent at once on the app's side of the filter
// and handed back through onAskCommandTaken, so a remount cannot ask twice; a follow-up inherits
// the side and the visibility of the chat it extends.
//
// An open answer's foot offers reply, summarize, share and close. Reply moves the composer under
// the answer and the answered chat re-keys to the top. Summarizing trades the chain for a digest
// for good, so it confirms first and shows a waiting indicator; a digest offers it disabled.
// Sharing opens the chat to every user under the asker's address, so it confirms too; unsharing
// just goes. A shared chat carries a marker on its row. Closing hands focus back to the question.
// While a question is in flight the composer withdraws behind the thinking indicator. Sample
// questions only fill the input.
export function Chat({ email, api, sampleQuestions, defaultTranscriptFolded = false,
                       askCommand = null, onAskCommandTaken }: {
  // The signed-in address, keying what this account's last visit saw of the others' chats.
  email: string;
  api: Pick<Api, "ask" | "getChatTranscript" | "deleteChatTurn" | "summarizeChatTurn" | "sourceUrl"
    | "setChatVisibility" | "clearChatVisibility" | "getPublicChats" | "getChatCount">;
  sampleQuestions: ChatSampleQuestion[];
  defaultTranscriptFolded?: boolean;
  askCommand?: string | null;
  onAskCommandTaken?: () => void;
}) {
  // The stored transcript, or null until first unfolded; the count stands in for it meanwhile.
  const [turns, setTurns] = useState<ChatTurn[] | null>(null);
  // The server's sizing of both lists, read on mount; null until it arrives.
  const [count, setCount] = useState<ChatCount | null>(null);
  // Whether others' chats were added since the last visit, which the count's arrival decides
  // and unfolding the list — seeing them — clears.
  const [othersGrew, setOthersGrew] = useState(false);
  // Timestamps of the chats whose answers are open.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  // The question awaiting its answer, or null. Doubles as the pending flag: the composer is
  // withdrawn while it is set, so at most one question is in flight.
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  // The chat whose digest is being made, or null. At most one summary is in flight, and the
  // chat's answer gives way to the waiting indicator while it is.
  const [summarizingAt, setSummarizingAt] = useState<string | null>(null);
  // The chat the next question follows up on, or null for a standalone question.
  const [replyTo, setReplyTo] = useState<ChatTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcriptFolded, setTranscriptFolded] = useState(defaultTranscriptFolded);
  const [filter, setFilter] = useState<ChatFilter>(storedChatFilter);
  const [othersFolded, setOthersFolded] = useState(true);
  // Other users' shared chats, or null until first unfolded; folding keeps what was loaded.
  const [others, setOthers] = useState<PublicChat[] | null>(null);
  useGlobalFold(setTranscriptFolded);
  useEffect(() => {
    if (transcriptFolded) setExpanded(new Set());
  }, [transcriptFolded]);
  // Question buttons by timestamp, for handing focus back when a chat folds from its answer's
  // foot or its digest replaces the answer that held it.
  const questionRefs = useRef(new Map<string, HTMLButtonElement>());

  // Sending withdraws the composer out from under the user's focus, so the thinking indicator
  // takes it: assistive tech announces the wait and the browser scrolls the indicator into view.
  const pendingRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (pendingQuestion !== null) pendingRef.current?.focus();
  }, [pendingQuestion]);

  // The summarize control goes with the answer it acted on, so the waiting indicator takes the
  // focus it held.
  const summarizingRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (summarizingAt !== null) summarizingRef.current?.focus();
  }, [summarizingAt]);

  // The toggle sits at the foot of the screen more often than not, so a transcript it opens
  // lands below the fold: the list walks into view once it is rendered, which on a first unfold
  // is only after the transcript loads. Only the toggle asks for this — a sent question scrolls
  // to its own indicator, and the page-wide unfold must not jump here.
  const transcript = useRef<HTMLUListElement>(null);
  const scrollTranscriptOnOpen = useRef(false);
  useEffect(() => {
    if (transcriptFolded || !scrollTranscriptOnOpen.current || transcript.current === null) return;
    scrollTranscriptOnOpen.current = false;
    transcript.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [transcriptFolded, turns]);

  useEffect(() => {
    api.getChatCount()
      .then((counted) => {
        setCount(counted);
        const last = storedPublicCount(email);
        setOthersGrew(last !== null && counted.public_total > last);
        storePublicCount(email, counted.public_total);
      })
      .catch((thrown) => setError(`ספירת הצ'אטים נכשלה (${(thrown as Error).message})`));
  }, [api, email]);

  // A question in flight defers the load: the answered chat is stored before the reply lands,
  // so the transcript fetched after it holds the chat, while one fetched during it would not.
  useEffect(() => {
    if (transcriptFolded || turns !== null || pendingQuestion !== null) return;
    api.getChatTranscript()
      .then((transcript) => setTurns(transcript.turns))
      .catch((thrown) => setError(`טעינת השיחה נכשלה (${(thrown as Error).message})`));
  }, [transcriptFolded, turns, pendingQuestion, api]);

  useEffect(() => {
    if (othersFolded || others !== null) return;
    api.getPublicChats()
      .then((listing) => setOthers(listing.chats))
      .catch((thrown) => setError(`טעינת הצ'אטים המשותפים נכשלה (${(thrown as Error).message})`));
  }, [othersFolded, others, api]);

  // Sends the question, as a follow-up on target when one is given. `app` marks a question the
  // app composed; a follow-up keeps whichever mark the chat it extends already carries.
  const send = async (question: string, target: ChatTurn | null, app = false) => {
    setError(null);
    setTranscriptFolded(false);
    // The answer must not land outside the listed side of the transcript.
    setFilter("all");
    setPendingQuestion(question);
    try {
      const asked = target === null ? question : composeFollowUp(target, question);
      const authored = target === null ? app : target.app;
      const reply = target === null
        ? await api.ask(asked, undefined, authored)
        : await api.ask(asked, target.at, authored);
      // An answered question is never a digest, so the freshly answered chat offers summarizing.
      // A follow-up stays shared as the chat it extends was; the server carries the mark over.
      const answered: ChatTurn = { question: asked, answer: reply.answer, sources: reply.sources,
                                   summarized: false, app: authored,
                                   visibility: target === null ? null : target.visibility,
                                   at: reply.at };
      // Fresh or followed-up, the answered turn leads — the order the server returns on reload.
      // A transcript not loaded yet is loaded now, after the reply, so it already holds the chat.
      const loaded = turns ?? (await api.getChatTranscript()).turns;
      setTurns([answered, ...loaded.filter((turn) => turn.at !== target?.at && turn.at !== reply.at)]);
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

  const sendDraft = () => {
    const question = draft.trim();
    if (!question) return;
    setDraft("");
    void send(question, replyTo);
  };

  useEffect(() => {
    if (askCommand === null) return;
    onAskCommandTaken!();
    // A commanded question stands alone: a reply the user had begun is dropped, not chained.
    setReplyTo(null);
    void send(askCommand, null, true);
    // The command alone triggers this; the state send closes over must not resend it.
  }, [askCommand]);

  // Deletion is permanent — no undo — so it stands behind the same confirm dialog as the
  // history table's per-row delete. The chat leaves the view only once the server confirms.
  const remove = async (turn: ChatTurn) => {
    if (!window.confirm("למחוק את השאלה והתשובה לצמיתות?")) return;
    setError(null);
    try {
      await api.deleteChatTurn(turn.at);
      setTurns((current) => current!.filter((kept) => kept.at !== turn.at));
      setExpanded((current) => dropped(current, turn.at));
      setReplyTo((current) => (current?.at === turn.at ? null : current));
    } catch (thrown) {
      setError(`מחיקת השאלה נכשלה (${(thrown as Error).message})`);
    }
  };

  // The digest lands under the chat's own timestamp, so the summarized chat is mapped in place
  // rather than moved the way a follow-up moves it.
  const summarize = async (turn: ChatTurn) => {
    if (!window.confirm("לסכם את השיחה? הסיכום יחליף את השאלות והתשובות לצמיתות.")) return;
    setError(null);
    setSummarizingAt(turn.at);
    try {
      const summarized = await api.summarizeChatTurn(turn.at);
      setTurns((current) => current!.map((kept) => (kept.at === turn.at ? summarized : kept)));
      // The chain a pending follow-up would have carried is gone, so the reply goes with it.
      setReplyTo((current) => (current?.at === turn.at ? null : current));
    } catch (thrown) {
      setError(`סיכום השיחה נכשל (${(thrown as Error).message})`);
    } finally {
      setSummarizingAt(null);
      // The indicator holding focus goes with the wait, so the chat's question button takes it
      // back — as it does when a chat folds from its answer's foot.
      questionRefs.current.get(turn.at)!.focus();
    }
  };

  // The mark lands on the chat in place: sharing changes who may read it, not where it sits.
  const setVisibility = async (turn: ChatTurn) => {
    setError(null);
    try {
      const shared = turn.visibility === null
        ? window.confirm(SHARE_CONFIRM) && await api.setChatVisibility(turn.at, "public")
        : await api.clearChatVisibility(turn.at);
      if (shared === false) return;
      setTurns((current) => current!.map((kept) =>
        (kept.at === turn.at ? { ...kept, visibility: shared.visibility } : kept)));
    } catch (thrown) {
      setError(`שינוי השיתוף נכשל (${(thrown as Error).message})`);
    }
  };

  const toggle = (at: string) => setExpanded((current) => flipped(current, at));

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
          <button type="button" className="glyph" aria-label="ביטול שאלת ההמשך"
            onClick={() => setReplyTo(null)}><Icon name="close" /></button>
        </div>
      )}
      <form onSubmit={(event) => { event.preventDefault(); sendDraft(); }}>
        <div className="composer">
          <textarea
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={replyTo === null ? "שאלה על סבא חטוב 👴…" : "שאלת המשך…"}
            aria-label="שאלה"
          />
          {draft !== "" && (
            <button type="button" className="glyph clear-draft" aria-label="ניקוי השאלה"
              onClick={() => setDraft("")}><Icon name="close" /></button>
          )}
        </div>
        <button type="submit" className="primary" disabled={draft.trim() === ""}>שליחה</button>
      </form>
    </>
  );

  // What the filter admits: the loaded chats once the transcript is in, the server's figures
  // before — every chat, the app's, or the rest.
  const listed = turns === null ? []
    : filter === "all" ? turns : turns.filter((turn) => turn.app === (filter === "app"));
  const ownTotal = turns === null ? count?.own_total : turns.length;
  const listedCount = turns !== null ? listed.length
    : count === null ? undefined
    : filter === "all" ? count.own_total
    : filter === "app" ? count.own_app : count.own_total - count.own_app;
  const filteredOut = ownTotal === undefined || listedCount === undefined ? 0 : ownTotal - listedCount;
  const othersTotal = others === null ? count?.public_total : others.length;
  // A toggle's figure, bold; the others' one is highlighted while it stands for chats added
  // since the last visit.
  const figure = (text: string, grew = false) =>
    <strong className={grew ? "count-new" : undefined}>{text}</strong>;

  return (
    <div className="chat">
      {sampleQuestions.length > 0 && (
        <div className="chat-samples">
          {sampleQuestions.map((sample) => (
            <button key={sample.label} type="button" className="secondary compact"
              onClick={() => setDraft(sample.question)}>{sample.label}</button>
          ))}
        </div>
      )}
      {replyTo === null && pendingQuestion === null && composer}
      {error && <div className="alert">{error}</div>}
      {ownTotal !== undefined && ownTotal > 0 && (
        <div className="transcript-head">
          <button type="button" className="disclosure transcript-toggle"
            aria-expanded={!transcriptFolded}
            disabled={listedCount === 0}
            onClick={() => {
              scrollTranscriptOnOpen.current = transcriptFolded;
              setTranscriptFolded((folded) => !folded);
            }}>
            {listedCount === 0 ? "אין צ'אטים קודמים שלי"
              : listedCount === 1 ? <>צ'אט קודם {figure("אחד")} שלי</>
              : <>{figure(String(listedCount))} צ'אטים קודמים שלי</>}
          </button>
          {filteredOut > 0 && (
            <span className="transcript-filtered-out">
              {filteredOut === 1 ? "מסונן אחד" : `${filteredOut} מסוננים`}
            </span>
          )}
          <select className="transcript-filter" aria-label="סינון הצ'אטים" value={filter}
            onChange={(event) => {
              const chosen = event.target.value as ChatFilter;
              setFilter(chosen);
              storeChatFilter(chosen);
            }}>
            <option value="all">הכול</option>
            <option value="mine">שלי</option>
            <option value="app">מהאפליקציה</option>
          </select>
        </div>
      )}
      {turns === null && !transcriptFolded && pendingQuestion === null && ownTotal !== undefined
        && ownTotal > 0 && <p>טוען…</p>}
      {(pendingQuestion !== null || (listed.length > 0 && !transcriptFolded)) && (
        <ul className="chat-messages" ref={transcript}>
          {replyTo === null && pendingExchange}
          {!transcriptFolded && listed.map((turn) => (
            <Fragment key={turn.at}>
              <li className="chat-user">
                <time className="chat-turn-at" dateTime={turn.at}>{instantLabel(turn.at)}</time>
                {turn.app && (
                  <span className="chat-app-mark" role="img" aria-label="שאלה מהאפליקציה">
                    <Icon name="spark" />
                  </span>
                )}
                {turn.visibility === "public" && (
                  <span className="chat-public-mark" role="img" aria-label="צ'אט משותף לכולם">
                    <Icon name="share" />
                  </span>
                )}
                <button type="button" className="disclosure chat-question"
                  ref={(el) => {
                    if (el) questionRefs.current.set(turn.at, el);
                    else questionRefs.current.delete(turn.at);
                  }}
                  aria-expanded={expanded.has(turn.at)}
                  onClick={() => toggle(turn.at)}>{renderQuestion(turn.question)}</button>
                <button type="button" className="glyph delete-turn"
                  aria-label={`מחיקת השאלה ${turn.question}`}
                  onClick={() => void remove(turn)}><Icon name="remove" /></button>
              </li>
              {expanded.has(turn.at) && (
                <li className="chat-assistant">
                  {summarizingAt === turn.at ? (
                    <p className="chat-pending" tabIndex={-1} ref={summarizingRef}>מסכם…</p>
                  ) : (
                    <>
                      <ChatAnswer answer={turn.answer} sources={turn.sources} api={api}
                                  onError={setError} />
                      <div className="answer-foot">
                        <button type="button" className="secondary compact reply-turn"
                          aria-label={`שאלת המשך על ${turn.question}`}
                          title={FOLLOW_UP_HINT}
                          aria-pressed={replyTo?.at === turn.at}
                          onClick={() => setReplyTo(turn)}>שאלת המשך</button>
                        <button type="button" className="secondary compact"
                          aria-label={`סיכום הצ'אט על ${turn.question}`}
                          title={SUMMARIZE_HINT}
                          disabled={turn.summarized}
                          onClick={() => void summarize(turn)}>סיכום הצ'אט</button>
                        <button type="button" className="secondary compact share-turn"
                          aria-label={`${turn.visibility === null ? "שיתוף" : "ביטול שיתוף"} הצ'אט על ${turn.question}`}
                          aria-pressed={turn.visibility !== null}
                          onClick={() => void setVisibility(turn)}>
                          {turn.visibility === null ? "שיתוף לכולם" : "ביטול השיתוף"}
                        </button>
                        <button type="button" className="secondary compact close-turn"
                          aria-label={`סגירת התשובה על ${turn.question}`}
                          onClick={() => collapseFromFoot(turn.at)}>סגירה</button>
                      </div>
                    </>
                  )}
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
      {othersTotal !== undefined && (
        <div className="transcript-head">
          <button type="button" className="disclosure others-toggle" aria-expanded={!othersFolded}
            disabled={othersTotal === 0}
            onClick={() => {
              setOthersGrew(false);
              setOthersFolded((folded) => !folded);
            }}>
            {othersTotal === 0 ? "אין צ'אטים של משתמשים אחרים"
              : othersTotal === 1 ? <>צ'אט {figure("אחד", othersGrew)} של משתמשים אחרים</>
              : <>{figure(String(othersTotal), othersGrew)} צ'אטים של משתמשים אחרים</>}
          </button>
        </div>
      )}
      {!othersFolded && (others === null ? <p>טוען…</p>
        : <PublicChatList chats={others} api={api} onError={setError} />)}
    </div>
  );
}
