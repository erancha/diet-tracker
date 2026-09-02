"""Cognito PreSignUp trigger gating sign-up and announcing each new user to the admin.

ALLOWED_EMAILS is a single regex the email must fullmatch case-insensitively — alternation
lists several addresses and ".*" opens sign-up to everyone. Raising here makes Cognito reject
the sign-up."""

import os
import re

import boto3

from common import notify
from common.log import get_logger

logger = get_logger(__name__)


def handler(event, context):
    email = event["request"]["userAttributes"]["email"].lower()
    if not re.fullmatch(os.environ["ALLOWED_EMAILS"], email, re.IGNORECASE):
        raise PermissionError(f"{email} is not on the diet-tracker allowlist")
    _notify_admin(email)
    return event


def _notify_admin(email):
    """Emails the admin that a new user signed up. The notice is observability, not a gate: a
    send failure is logged and must never deny the sign-up itself."""
    sender = os.environ["SES_SENDER"]
    admin = os.environ["ADMIN_EMAIL"]
    try:
        boto3.client("ses").send_email(
            Source=sender,
            Destination={"ToAddresses": [admin]},
            Message={
                "Subject": {"Data": f"משתמש חדש — {notify.APP_NAME}", "Charset": "UTF-8"},
                "Body": {"Text": {"Data": f"משתמש חדש נרשם לאפליקציה: {email}", "Charset": "UTF-8"}},
            },
        )
        logger.info("admin notified of new user %s", email)
    except Exception:
        logger.exception("admin notification failed for new user %s", email)
