// What the two controls under an answer do, which their labels name but do not explain: a
// follow-up carries this chat's question and answer up with it, and summarizing is a one-way
// trade of the conversation for a digest of it — chat_history.summarize drops the chain, the
// follow-ups and the citations for good.
const FOLLOW_UP_HINT =
  "שאלה נוספת על אותה שיחה — היא נשלחת יחד עם השאלה והתשובה שכאן, כדי שהתשובה תמשיך אותן.";
const SUMMARIZE_HINT =
  "החלפת השיחה בסיכום קצר של מה שנשאל והוסק. השאלות, התשובות והמקורות שבה נמחקים ולא ניתן לשחזר אותם.";

// The controls at the end of an open answer, given the chat's question for their labels. Closing
// is always offered; a chat the user owns also gets reply, summarize and share. In readOnly mode
// — another user's shared chat — closing stands alone, the rest being the asker's to do.
export function AnswerFoot({ question, onClose, ...own }: { question: string; onClose: () => void }
  & ({ readOnly: true } | {
    readOnly: false;
    replyPressed: boolean;
    onReply: () => void;
    summarized: boolean;
    onSummarize: () => void;
    shared: boolean;
    onShare: () => void;
  })) {
  return (
    <div className="answer-foot">
      {!own.readOnly && (
        <>
          <button type="button" className="secondary compact reply-turn"
            aria-label={`שאלת המשך על ${question}`}
            title={FOLLOW_UP_HINT}
            aria-pressed={own.replyPressed}
            onClick={own.onReply}>שאלת המשך</button>
          <button type="button" className="secondary compact"
            aria-label={`סיכום הצ'אט על ${question}`}
            title={SUMMARIZE_HINT}
            disabled={own.summarized}
            onClick={own.onSummarize}>סיכום הצ'אט</button>
          <button type="button" className="secondary compact share-turn"
            aria-label={`${own.shared ? "ביטול שיתוף" : "שיתוף"} הצ'אט על ${question}`}
            aria-pressed={own.shared}
            onClick={own.onShare}>
            {own.shared ? "ביטול השיתוף" : "שיתוף לכולם"}
          </button>
        </>
      )}
      <button type="button" className="secondary compact close-turn"
        aria-label={`סגירת התשובה על ${question}`}
        onClick={onClose}>סגירה</button>
    </div>
  );
}
