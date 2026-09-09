"""Cognito PreSignUp trigger gating sign-up, requesting the new address's SES verification and
announcing each new user to the admin.

ALLOWED_EMAILS is a single regex the email must fullmatch case-insensitively — alternation
lists several addresses and ".*" opens sign-up to everyone. Raising here makes Cognito reject
the sign-up."""

import os
import re

import boto3

from common import notify, ses_identity
from common.log import get_logger

logger = get_logger(__name__)


def handler(event, context):
    email = event["request"]["userAttributes"]["email"].lower()
    if not re.fullmatch(os.environ["ALLOWED_EMAILS"], email, re.IGNORECASE):
        raise PermissionError(f"{email} is not on the diet-tracker allowlist")
    ses = boto3.client("ses")
    _request_verification(ses, email)
    _notify_admin(ses, email)
    return event


def _request_verification(ses, email):
    """Asks SES to mail the user its address-verification request, unless the address is already
    verified or the request is already out. While the account sits in the SES sandbox nothing
    can be delivered to an address before it is verified, so the request has to go out at
    sign-up rather than wait for the admin. Best effort like the admin notice: a failure is
    logged and must never deny the sign-up."""
    try:
        status = ses_identity.verification_status(ses, email)
        if status not in (ses_identity.VERIFIED, ses_identity.PENDING):
            ses.verify_email_identity(EmailAddress=email)
    except Exception:
        logger.exception("verification request failed for new user %s", email)


def _notify_admin(ses, email):
    """Emails the admin that a new user signed up. The notice is observability, not a gate: a
    send failure is logged and must never deny the sign-up itself."""
    try:
        notify.send_plain_email(ses, os.environ["SES_SENDER"],
                                os.environ["ADMIN_EMAIL"], f"משתמש חדש — {notify.APP_NAME}",
                                f"משתמש חדש נרשם לאפליקציה: {email}")
    except Exception:
        logger.exception("admin notification failed for new user %s", email)
