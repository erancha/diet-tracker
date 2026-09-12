import { useState } from "react";
import type { Api } from "../api";
import type { ChatSource } from "../types";

// Sources are named by the file they were retrieved from. Only a PDF is offered to open: the
// corpus also holds the app's own guide files, which are not for readers.
const isPdf = (fileName: string) => fileName.toLowerCase().endsWith(".pdf");

// What the score column measures. The figure is the retrieval engine's similarity between the
// question and the document, which ranks the citations — it is not a confidence in the answer,
// and a reader meeting a number like 42% under a heading of התאמה will otherwise read it as one.
// The stated range is what this deployment's own stored citations actually span.
const MATCH_HINT =
  "מידת הדמיון בין השאלה למסמך, לפי מנוע החיפוש — לא אחוז הנכונות של התשובה. "
  + "בפועל הערכים נעים בערך בין 35% ל-80%, והמספר משמש בעיקר לדירוג המקורות ביניהם.";

// The body of one answer bubble: the answer and, behind a toggle, its sources as a table of file
// and match-percent rows, each PDF opening in a new tab. Shared by the own transcript and the
// others' list; the controls around the answer are each list's own.
export function ChatAnswer({ answer, sources, api, onError }: {
  answer: string;
  sources: ChatSource[];
  api: Pick<Api, "sourceUrl">;
  // The list's alert: a message to show, or null to clear it.
  onError: (message: string | null) => void;
}) {
  const [sourcesShown, setSourcesShown] = useState(false);

  // The tab is opened on the press itself, before the link is known: a tab opened once an
  // await has passed is the kind a browser blocks as unasked-for.
  const openSource = async (fileName: string) => {
    onError(null);
    const tab = window.open("", "_blank");
    try {
      const { url } = await api.sourceUrl(fileName);
      tab!.location.href = url;
    } catch (thrown) {
      tab!.close();
      onError(`פתיחת המקור נכשלה (${(thrown as Error).message})`);
    }
  };

  return (
    <>
      <p>{answer}</p>
      {sources.length > 0 && (
        <>
          <button type="button" className="disclosure more-toggle" aria-expanded={sourcesShown}
            onClick={() => setSourcesShown((shown) => !shown)}>
            {sourcesShown ? "פחות" : "מקורות והתאמה"}
          </button>
          {sourcesShown && (
            <table className="chat-sources">
              <thead>
                <tr><th>מקור</th><th title={MATCH_HINT}>התאמה</th></tr>
              </thead>
              <tbody>
                {sources.map((source, index) => (
                  <tr key={index}>
                    <td>
                      {isPdf(source.fileName) ? (
                        <button type="button" className="chat-source-open"
                                onClick={() => openSource(source.fileName)}>
                          {source.fileName}
                        </button>
                      ) : source.fileName}
                    </td>
                    <td>{Math.round(source.score * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
