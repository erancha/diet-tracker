"""Outbound notification: what the app says in a message, and the channels that carry it — SES
email (always on) and the optional Telegram Bot API.

Telegram is called with stdlib urllib so the Lambdas carry no third-party HTTP dependency,
keeping cold starts minimal. send_email and send_telegram raise on failure and log a
per-recipient receipt on success, so both outcomes are answerable from CloudWatch.
telegram_config resolves whether the Telegram channel is active at all, per the bot-token SSM
parameter."""

import json
import urllib.request

from common.log import get_logger

logger = get_logger(__name__)

# The frontend states the product name independently in frontend/src/appTitle.ts.
APP_NAME = "מעקב תזונה"

ALERT_SUBJECT = f"התראת תזונה — {APP_NAME}"


def violation_text(violations) -> str:
    """Render tripped rules as the message body."""
    return "התראות תזונה:\n" + "\n".join(f"• {v.message}" for v in violations)


def send_email(ses_client, sender, recipient, subject, body) -> None:
    ses_client.send_email(
        Source=sender,
        Destination={"ToAddresses": [recipient]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Text": {"Data": body, "Charset": "UTF-8"}},
        },
    )
    logger.info("email sent to=%s subject=%s", recipient, subject)


def send_telegram(bot_token, chat_id, text) -> None:
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{bot_token}/sendMessage",
        data=json.dumps({"chat_id": chat_id, "text": text}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request) as response:
        payload = json.loads(response.read())
    if not payload["ok"]:
        raise RuntimeError(f"Telegram send failed: {payload}")
    logger.info("telegram sent chat_id=%s", chat_id)


def telegram_config(ssm_client, bot_token_param, chat_map_param):
    """Resolve the optional Telegram channel: (bot_token, chat_map), or None when disabled.

    The bot-token parameter's absence is the declared off switch for the whole channel; any
    other failure — including a missing chat map alongside an existing token — is a real
    misconfiguration and raises."""
    try:
        token = ssm_client.get_parameter(Name=bot_token_param, WithDecryption=True)["Parameter"]["Value"]
    except ssm_client.exceptions.ParameterNotFound:
        return None
    chat_map_value = ssm_client.get_parameter(Name=chat_map_param, WithDecryption=True)["Parameter"]["Value"]
    return token, json.loads(chat_map_value)
