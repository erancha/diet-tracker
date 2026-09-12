// Copies of a set with one member flipped or dropped: the open answers a chat list keeps by
// timestamp.

// A copy of the set with the timestamp added if absent, removed if present.
export function flipped(current: Set<string>, at: string): Set<string> {
  const next = new Set(current);
  if (!next.delete(at)) next.add(at);
  return next;
}

export function dropped(current: Set<string>, at: string): Set<string> {
  const next = new Set(current);
  next.delete(at);
  return next;
}
