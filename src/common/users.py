"""Resolves the allowlisted users and their Telegram bindings.

The Cognito pool is the user registry (a handful of accounts — one page by design); the SSM
chat map is maintained manually during onboarding, so a signed-up user without a binding is an
operational error that must surface, not a user to skip."""

from dataclasses import dataclass


@dataclass(frozen=True)
class User:
    sub: str
    email: str


def list_users(cognito_client, user_pool_id) -> list:
    response = cognito_client.list_users(UserPoolId=user_pool_id)
    if "PaginationToken" in response:
        raise RuntimeError("user pool exceeds one page — contradicts the small-allowlist design")
    result = []
    for user in response["Users"]:
        attributes = {a["Name"]: a["Value"] for a in user["Attributes"]}
        result.append(User(sub=attributes["sub"], email=attributes["email"].lower()))
    return result


def chat_id_for(chat_map: dict, email: str) -> str:
    if email not in chat_map:
        raise LookupError(f"no Telegram chat id bound for {email}; complete onboarding")
    return chat_map[email]
