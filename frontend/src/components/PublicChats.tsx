import { Fragment, useEffect, useRef, useState } from "react";
import type { Api } from "../api";
import { renderQuestion } from "../chatChain";
import { instantLabel } from "../dates";
import { flipped } from "../setToggle";
import type { PublicChat } from "../types";
import { AnswerFoot } from "./AnswerFoot";
import { ChatAnswer } from "./ChatAnswer";
import { useAnswerReveal } from "./useAnswerReveal";

// The chats other users shared, newest first, each under its asker's address and date with the
// answer and its sources folded behind the question. Read-only: no follow-up, digest, share or
// delete, the chat being someone else's; an open answer's foot offers closing alone, which
// hands focus back to the question. Loading, folding and the error alert are the chat's.
// A chat named by `reveal` is opened, its question focused and its answer scrolled into view,
// and the request handed back through onRevealed, so a re-render cannot reopen it.
export function PublicChatList({ chats, api, onError, reveal, onRevealed }: {
  chats: PublicChat[];
  api: Pick<Api, "sourceUrl">;
  onError: (message: string | null) => void;
  reveal: string | null;
  onRevealed: () => void;
}) {
  // Timestamps of the chats whose answers are open.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Question buttons by timestamp, for handing focus to a revealed chat.
  const questionRefs = useRef(new Map<string, HTMLButtonElement>());
  const { markAnswer, answerRef } = useAnswerReveal();
  useEffect(() => {
    if (reveal === null) return;
    onRevealed();
    const question = questionRefs.current.get(reveal);
    if (question === undefined) {
      onError("הצ'אט המשותף כבר אינו זמין");
      return;
    }
    setExpanded((current) => new Set(current).add(reveal));
    question.focus({ preventScroll: true });
    markAnswer(reveal);
    // The request alone triggers this; the list it names is rendered by the time it is set.
  }, [reveal]);

  // Folding from the answer's foot would leave the reader mid-list, so focus moves to the chat's
  // question button — which also scrolls it back into view.
  const collapseFromFoot = (at: string) => {
    setExpanded((current) => flipped(current, at));
    questionRefs.current.get(at)!.focus();
  };

  return (
    <ul className="chat-messages">
      {chats.map((chat) => (
        <Fragment key={chat.at}>
          <li className="chat-user chat-others">
            <span className="chat-turn-at">
              <span className="chat-asker">{chat.email}</span>
              {" · "}
              <time dateTime={chat.at}>{instantLabel(chat.at)}</time>
            </span>
            <button type="button" className="disclosure chat-question"
              ref={(el) => {
                if (el) questionRefs.current.set(chat.at, el);
                else questionRefs.current.delete(chat.at);
              }}
              aria-expanded={expanded.has(chat.at)}
              onClick={() => setExpanded((current) => flipped(current, chat.at))}>
              {renderQuestion(chat.question)}
            </button>
          </li>
          {expanded.has(chat.at) && (
            <li className="chat-assistant chat-others" ref={answerRef(chat.at)}>
              <ChatAnswer answer={chat.answer} sources={chat.sources} api={api} onError={onError} />
              <AnswerFoot question={chat.question} readOnly onClose={() => collapseFromFoot(chat.at)} />
            </li>
          )}
        </Fragment>
      ))}
    </ul>
  );
}
