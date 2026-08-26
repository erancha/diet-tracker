// The discard guard every form holding uncommitted edits routes through: one confirmation
// wording, one rule for when it is asked. Discarding is unrecoverable — the form holds the only
// copy of the edits — so the same loss reads the same wherever it is offered.

export const DISCARD_EDITS_PROMPT = "לבטל את השינויים? מה שערכת יאבד.";

// Whether the caller may go ahead and throw a form's edits away. It asks only once the form has
// actually moved off what it opened on: leaving an untouched form loses nothing, and a dialog
// there would train the user to dismiss the one that matters.
export function mayDiscardEdits(pending: boolean): boolean {
  return !pending || window.confirm(DISCARD_EDITS_PROMPT);
}
