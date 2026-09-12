import { Fragment, useState } from "react";
import type { Api } from "../api";
import { renderQuestion } from "../chatChain";
import { instantLabel } from "../dates";
import { flipped } from "../setToggle";
import type { PublicChat } from "../types";
import { ChatAnswer } from "./ChatAnswer";

// The chats other users shared, newest first, each under its asker's address and date with the
// answer and its sources folded behind the question. Read-only: no follow-up, digest, share or
// delete, the chat being someone else's. Loading, folding and the error alert are the chat's.
export function PublicChatList({ chats, api, onError }: {
  chats: PublicChat[];
  api: Pick<Api, "sourceUrl">;
  onError: (message: string | null) => void;
}) {
  // Timestamps of the chats whose answers are open.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
              aria-expanded={expanded.has(chat.at)}
              onClick={() => setExpanded((current) => flipped(current, chat.at))}>
              {renderQuestion(chat.question)}
            </button>
          </li>
          {expanded.has(chat.at) && (
            <li className="chat-assistant chat-others">
              <ChatAnswer answer={chat.answer} sources={chat.sources} api={api} onError={onError} />
            </li>
          )}
        </Fragment>
      ))}
    </ul>
  );
}
