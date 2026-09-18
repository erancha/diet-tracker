// The text a chat list is narrowed by: a query of words, `&` joining words a chat must hold all
// of and `|` separating alternatives it need hold only one of, `&` binding tighter. Blank terms
// are dropped, so a half-typed query narrows by the words already in it.

// The alternatives a query names, each the words a chat must hold together. A query naming no
// word at all yields no alternative, which admits every chat.
function alternatives(query: string): string[][] {
  return query.split("|")
    .map((alternative) => alternative.split("&").map((term) => term.trim().toLowerCase())
                                     .filter((term) => term !== ""))
    .filter((terms) => terms.length > 0);
}

export function chatMatches(query: string, ...texts: string[]): boolean {
  const required = alternatives(query);
  if (required.length === 0) return true;
  const searched = texts.join("\n").toLowerCase();
  return required.some((terms) => terms.every((term) => searched.includes(term)));
}
