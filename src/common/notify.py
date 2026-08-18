"""Delivery primitives for the nudge channels: SES email (always on) and the optional Telegram
Bot API.

Telegram is called with stdlib urllib so the Lambdas carry no third-party HTTP dependency,
keeping cold starts minimal. send_email and send_telegram raise on failure — delivery problems
must surface in CloudWatch, not vanish. telegram_config resolves whether the Telegram channel is
active at all, per the bot-token SSM parameter."""

import json
import urllib.request


def send_email(ses_client, sender, recipient, subject, body) -> None:
    ses_client.send_email(
        Source=sender,
        Destination={"ToAddresses": [recipient]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Text": {"Data": body, "Charset": "UTF-8"}},
        },
    )


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
