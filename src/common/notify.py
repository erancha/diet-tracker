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
import urllib.request

from common.log import get_logger

logger = get_logger(__name__)

# The frontend states the product name independently in frontend/src/appTitle.ts.
APP_NAME = "מעקב תזונה AI"

# Names the same account-menu action the frontend renders in Header.tsx.
MUTE_FOOTNOTE = 'להפסקת ההתראות: בתפריט החשבון באפליקציה בחרו "ביטול התראות"'


_BODY_FONT_PX = 15

# A bullet is one finding under the line that sums them up, so it sits a step below it in size.
_BULLET_FONT_PX = _BODY_FONT_PX - 1
_BULLET = "• "


def _line_html(line, first) -> str:
    """One body line as HTML: the opening line in bold — every message this app sends leads with
    what it came to — and a bullet a size smaller. Escaping first means a line can only ever
    contribute text, never markup of its own."""
    escaped = html.escape(line)
    if first:
        return f"<strong>{escaped}</strong>"
    if line.startswith(_BULLET):
        return f'<span style="font-size: {_BULLET_FONT_PX}px">{escaped}</span>'
    return escaped


# The mute footnote closes the mail a step below the body, so it reads as a note about the mail
# rather than part of the message.
_FOOTNOTE_FONT_PX = _BODY_FONT_PX - 3


def _rtl_div(rendered, font_px) -> str:
    """Wraps already-escaped HTML in the direction and type the mail is read in."""
    return (f'<div dir="rtl" style="font-family: Arial, sans-serif; font-size: {font_px}px; '
            f'line-height: 1.6; white-space: normal">{rendered}</div>')


def rtl_html(body) -> str:
    """One message body as the right-to-left HTML its email carries.

    Every message this app sends is Hebrew. A text-only email leaves direction to the reader's
    mail client, which guesses per line and strands a trailing colon or a Latin number on the
    wrong edge; declaring the direction once is what makes a bullet list read as written."""
    lines = body.split("\n")
    rendered = "<br>".join(_line_html(line, first=index == 0)
                           for index, line in enumerate(lines))
    return _rtl_div(rendered, _BODY_FONT_PX)


def _send(ses_client, sender, recipient, subject, text, html_body) -> None:
    """Sends one email as both parts, so a reader whose client refuses HTML loses only the
    direction and the type, never the message."""
    ses_client.send_email(
        Source=sender,
        Destination={"ToAddresses": [recipient]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Text": {"Data": text, "Charset": "UTF-8"},
                     "Html": {"Data": html_body, "Charset": "UTF-8"}},
        },
    )
    logger.info("email sent to=%s subject=%s", recipient, subject)


def send_plain_email(ses_client, sender, recipient, subject, body) -> None:
    """Sends one email with the body exactly as given — the variant for admin notices, which
    carry no user-facing mute footnote."""
    _send(ses_client, sender, recipient, subject, body, rtl_html(body))


def send_email(ses_client, sender, recipient, subject, body, app_url) -> None:
    """Sends one user-facing email, closing it with the app's address and then the mute footnote —
    appending here rather than at call sites is what guarantees every user-facing email carries its
    own way out. The address sits directly under the message so a reader who came to act on it
    reaches the app before the note on how to stop the mail."""
    message = f"{body}\n\n{app_url}"
    # The footnote rides in its own block, so the blank line the text part carries between the two
    # has to be drawn explicitly here.
    footnote = f"<br><br>{_rtl_div(html.escape(MUTE_FOOTNOTE), _FOOTNOTE_FONT_PX)}"
    _send(ses_client, sender, recipient, subject, f"{message}\n\n{MUTE_FOOTNOTE}",
          rtl_html(message) + footnote)


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
