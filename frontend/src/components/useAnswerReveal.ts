import { useRef } from "react";

// Scrolls a revealed chat's answer into view once it renders: the reveal marks the chat, and the
// answer's ref callback, which runs only once the answer is in the DOM, scrolls it to the nearest
// edge — a short answer rises into view whole, a long one from its top. The mark is spent on that
// first render, so a re-render cannot scroll again.
export function useAnswerReveal() {
  const marked = useRef<string | null>(null);
  const markAnswer = (at: string) => { marked.current = at; };
  const answerRef = (at: string) => (answer: HTMLLIElement | null) => {
    if (answer === null || marked.current !== at) return;
    marked.current = null;
    answer.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  return { markAnswer, answerRef };
}
