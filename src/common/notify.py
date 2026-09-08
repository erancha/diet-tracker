"""Outbound notification: what the app says in a message, and the channels that carry it — SES
email (always on, carrying every body as right-to-left HTML beside its plain text) and the
optional Telegram Bot API.

Telegram is called with stdlib urllib so the Lambdas carry no third-party HTTP dependency,
keeping cold starts minimal. send_plain_email carries admin notices as-is; send_email is the
user-facing variant that appends the mute footnote. All senders raise on failure and log a
per-recipient receipt on success, so both outcomes are answerable from CloudWatch.
telegram_config resolves whether the Telegram channel is active at all, per the bot-token SSM
parameter."""

import html
import json
import re
import urllib.request

from common.log import get_logger

logger = get_logger(__name__)

# The frontend states the product name independently in frontend/src/appTitle.ts.
APP_NAME = "מעקב תזונה AI"

ALERT_SUBJECT = f"התראת תזונה — {APP_NAME}"

# Names the same account-menu action the frontend renders in Header.tsx.
MUTE_FOOTNOTE = 'להפסקת ההתראות: בתפריט החשבון באפליקציה בחרו "ביטול התראות"'


def violation_text(violations) -> str:
    """Render tripped rules as the message body."""
    return "התראות תזונה:\n" + "\n".join(f"• {v.message}" for v in violations)


# A bullet's opening label, up to and including its colon — "דורש תשומת לב:" and its kin. Bounded
# so a colon deeper in the sentence, or one inside a clock time, cannot swallow the whole line.
_BULLET_LABEL = re.compile(r"^(• [^:]{1,30}:)(.*)$")


def _line_html(line, first) -> str:
    """One body line as HTML, with the reader's two landmarks in bold: the opening line, which
    every message this app sends leads with, and the label a recap bullet opens with. Escaping
    first means a line can only ever contribute text, never markup of its own."""
    escaped = html.escape(line)
    if first:
        return f"<strong>{escaped}</strong>"
    label = _BULLET_LABEL.match(escaped)
    if label is None:
        return escaped
    return f"<strong>{label.group(1)}</strong>{label.group(2)}"


def rtl_html(body) -> str:
    """One message body as the right-to-left HTML its email carries.

    Every message this app sends is Hebrew. A text-only email leaves direction to the reader's
    mail client, which guesses per line and strands a trailing colon or a Latin number on the
    wrong edge; declaring the direction once is what makes a bullet list read as written."""
    lines = body.split("\n")
    rendered = "<br>".join(_line_html(line, first=index == 0)
                           for index, line in enumerate(lines))
    return (f'<div dir="rtl" style="font-family: Arial, sans-serif; font-size: 15px; '
            f'line-height: 1.6; white-space: normal">{rendered}</div>')


def send_plain_email(ses_client, sender, recipient, subject, body) -> None:
    """Sends one email with the body exactly as given — the variant for admin notices, which
    carry no user-facing mute footnote. The same body rides twice, as text and as the
    right-to-left HTML most clients show, so a reader whose client refuses HTML loses only the
    direction."""
    ses_client.send_email(
        Source=sender,
        Destination={"ToAddresses": [recipient]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Text": {"Data": body, "Charset": "UTF-8"},
                     "Html": {"Data": rtl_html(body), "Charset": "UTF-8"}},
        },
    )
    logger.info("email sent to=%s subject=%s", recipient, subject)


def send_email(ses_client, sender, recipient, subject, body, app_url) -> None:
    """Sends one user-facing email, closing it with the mute footnote and the app's address —
    appending here rather than at call sites is what guarantees every user-facing email carries
    its own way out."""
    send_plain_email(ses_client, sender, recipient, subject,
                     f"{body}\n\n{MUTE_FOOTNOTE}\n{app_url}")


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
