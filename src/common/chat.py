"""Client for the external RAG answering service (Summaries.AI's POST /rag/query).

The service answers questions over a fixed knowledge base configured on its side; this client
only carries the question and the service API key. Called with stdlib urllib per the notify.py
precedent, so the Lambdas carry no third-party HTTP dependency. ask raises on any failure —
an unreachable or erroring service is the caller's contract state to handle."""

import json
import urllib.request

# Below the Lambda's 30s timeout, so a hung service surfaces as an error the caller can map to
# a clean 502 — URLError while connecting, TimeoutError once reading — instead of the Lambda
# dying mid-request.
TIMEOUT_SECONDS = 25


def api_key(ssm_client, key_param) -> str:
    return ssm_client.get_parameter(Name=key_param, WithDecryption=True)["Parameter"]["Value"]


def ask(api_url, key, question) -> dict:
    """Returns the service's {'answer': str, 'sources': [{'fileName', 'score'}]} for a question."""
    request = urllib.request.Request(
        f"{api_url}/rag/query",
        data=json.dumps({"question": question}, ensure_ascii=False).encode(),
        headers={"Content-Type": "application/json", "x-api-key": key},
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return json.loads(response.read())
