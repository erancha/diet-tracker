"""Client for the external RAG service (Summaries.AI's POST /rag/query and POST /rag/document-url).

The service answers questions over a fixed knowledge base configured on its side; this client
carries the question, an optional grounding-context block and the service API key. Upstream
embeds only the question for retrieval and hands the context to the answering LLM alone, so
bulky context never dilutes the similarity search. It also hands back a short-lived link to one
document an answer cited, by the file name the answer's sources carried. Called with stdlib
urllib per the notify.py precedent, so the Lambdas carry no third-party HTTP dependency. Every
call raises on failure — an unreachable or erroring service is the caller's contract state to
handle."""

import json
import urllib.error
import urllib.request

# The upstream /rag/query contract caps these fields (Summaries.AI ragQueryContract.ts
# MAX_QUESTION_CHARS / MAX_CONTEXT_CHARS); every sent value must stay within.
MAX_QUESTION_CHARS = 4000
MAX_CONTEXT_CHARS = 8000

# The default wait: below the 30s budget of the request-serving Lambdas, so a hung service
# surfaces as an error they can map to a clean 502 — URLError while connecting, TimeoutError once
# reading — instead of the Lambda dying mid-request. A caller with a longer budget passes its own.
TIMEOUT_SECONDS = 25


def api_key(ssm_client, key_param) -> str:
    return ssm_client.get_parameter(Name=key_param, WithDecryption=True)["Parameter"]["Value"]


class DocumentNotFound(LookupError):
    """The service holds no document under the requested file name."""


def ask(api_url, key, question, context=None, timeout=TIMEOUT_SECONDS) -> dict:
    """Returns the service's {'answer': str, 'sources': [{'fileName', 'score'}]} for a question,
    grounded also in the context block when one is given.

    The timeout is the caller's own budget for the wait: whatever room its Lambda has left after
    the rest of its work, never longer."""
    payload = {"question": question}
    if context is not None:
        payload["context"] = context
    return _post(api_url, key, "/rag/query", payload, timeout)


def document_url(api_url, key, file_name, timeout=TIMEOUT_SECONDS) -> str:
    """Returns a short-lived link to the cited document named file_name, minted by the service
    for this call; raises DocumentNotFound when the service holds no such document."""
    try:
        return _post(api_url, key, "/rag/document-url", {"fileName": file_name}, timeout)["url"]
    except urllib.error.HTTPError as error:
        if error.code == 404:
            raise DocumentNotFound(file_name) from error
        raise


def _post(api_url, key, path, payload, timeout) -> dict:
    request = urllib.request.Request(
        f"{api_url}{path}",
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers={"Content-Type": "application/json", "x-api-key": key},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read())
