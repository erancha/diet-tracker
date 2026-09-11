"""One question asked on behalf of a user: their tracked data attached as the grounding context,
the answering service called, and the reply stored in their transcript.

Both the chat endpoint and the weekly recap's follow-up ask through here, so a question the app
raises for a user reaches the service in the shape the user's own question takes — the same
context block, the same transcript write. What stays with the endpoint is the work only an HTTP
request has: validating a body, spending the daily quota, and turning a failure into a status
code."""

from common import chat, chat_context, chat_history
from common.dates import today


def answer(rag_url, key, store, questionnaire, history_table, sub, question,
           at=None, app=False, timeout=chat.TIMEOUT_SECONDS) -> dict:
    """Asks one question for the user named by sub and returns the stored chat as
    {'answer', 'sources', 'at'}, `at` being its timestamp in the transcript.

    With `at` given the question follows up on that stored chat, which the answered one replaces;
    `app` marks the chat as one the app composed. The upstream errors reach the caller as they
    are — an unreachable service raises URLError or TimeoutError, and an `at` naming no chat of
    this user's raises KeyError — because what to do about either is the caller's to decide.
    The timeout is the caller's own budget for the wait, as it is for the client."""
    context = chat_context.user_context(store, questionnaire, sub, today())
    reply = chat.ask(rag_url, key, question, context, timeout=timeout)
    stored_at = chat_history.append(history_table, sub, question, reply["answer"],
                                    reply["sources"], at=at, app=app)
    return {"answer": reply["answer"], "sources": reply["sources"], "at": stored_at}
