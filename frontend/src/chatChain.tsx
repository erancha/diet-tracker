import { Fragment, type ReactNode } from "react";

// The labels a followed-up conversation is chained under inside its one stored question.
// common/chat_history.py composes and parses the same chain, so the wording is a cross-runtime
// contract rather than presentation.
export const ORIGINAL_LABEL = "השאלה המקורית:";
export const ANSWER_LABEL = "התשובה:";
export const FOLLOW_UP_LABEL = "שאלת המשך:";
const CHAIN_LABELS = [ORIGINAL_LABEL, ANSWER_LABEL, FOLLOW_UP_LABEL];

// Bolds each chain label of a stored question after a blank line (the holding button pre-wraps).
// Folded answers may span lines themselves, so only lines opening with a label start a section.
export function renderQuestion(text: string): ReactNode {
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
