// One request to the answering service, seen through to its result even when the API's
// gateway gives up on the request first.

import { ApiError } from "./api";

// How long the chat Lambda waits on the answering service (template.yaml ChatFunction Timeout):
// an answer lands in the transcript within it or not at all.
const ANSWER_WAIT_MS = 60_000;
// Room past that for storing the answer and for the poll that finds it.
const POLL_SLACK_MS = 5_000;

// Whether a failed request means the answer may still land: the gateway gave up on the request
// — its own errors carry no reason, while the handler states one on every failure of its own —
// or the connection dropped before any response.
function answerMayStillLand(failure: unknown): boolean {
  return !(failure instanceof ApiError) || (failure.status >= 500 && failure.serverError === null);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Sends the request and returns its result. When the gateway gave up on the request before the
 * answer came, the Lambda behind it keeps waiting and stores the answer, so the transcript is
 * read through `landed` every `pollMs` until it holds the result, for as long as the Lambda
 * could still be storing it; `onPolling` is called once when that wait begins. A failure the
 * handler gave a reason for is final and is rethrown at once, as is one that nothing lands
 * for by the end.
 */
export async function fromUpstream<T>(
  request: () => Promise<T>,
  landed: () => Promise<T | null>,
  pollMs: number,
  onPolling: () => void,
): Promise<T> {
  const started = Date.now();
  try {
    return await request();
  } catch (failure) {
    if (!answerMayStillLand(failure)) throw failure;
    onPolling();
    while (Date.now() - started < ANSWER_WAIT_MS + POLL_SLACK_MS) {
      await sleep(pollMs);
      const result = await landed();
      if (result !== null) return result;
    }
    throw failure;
  }
}
