import boto3
import pytest
from moto import mock_aws

from common import users


def test_list_users_returns_sub_and_lowercased_email():
    with mock_aws():
        cognito = boto3.client("cognito-idp", region_name="eu-central-1")
        pool_id = cognito.create_user_pool(PoolName="p")["UserPool"]["Id"]
        cognito.admin_create_user(
            UserPoolId=pool_id, Username="google_1",
            UserAttributes=[{"Name": "email", "Value": "Someone@Gmail.com"}],
        )
        result = users.list_users(cognito, pool_id)
        assert len(result) == 1
        assert result[0].email == "someone@gmail.com"
        assert result[0].sub


def test_chat_id_for_unbound_user_is_loud():
    assert users.chat_id_for({"a@gmail.com": "111"}, "a@gmail.com") == "111"
    with pytest.raises(LookupError):
        users.chat_id_for({}, "b@gmail.com")
