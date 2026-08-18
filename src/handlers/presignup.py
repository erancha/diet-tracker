"""Cognito PreSignUp trigger enforcing the account allowlist: raising here makes Cognito
reject the sign-up, so no non-allowlisted Google account can ever create a user."""

import os


def handler(event, context):
    allowed = {e.strip().lower() for e in os.environ["ALLOWED_EMAILS"].split(",")}
    email = event["request"]["userAttributes"]["email"].lower()
    if email not in allowed:
        raise PermissionError(f"{email} is not on the diet-tracker allowlist")
    return event
