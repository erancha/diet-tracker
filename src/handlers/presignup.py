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
    try:
        notify.send_plain_email(boto3.client("ses"), os.environ["SES_SENDER"],
                                os.environ["ADMIN_EMAIL"], f"משתמש חדש — {notify.APP_NAME}",
                                f"משתמש חדש נרשם לאפליקציה: {email}")
    except Exception:
        logger.exception("admin notification failed for new user %s", email)
