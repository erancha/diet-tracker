import boto3
from boto3.dynamodb.conditions import Key
from moto import mock_aws

from common.paging import count_all, query_all


def test_reads_and_counts_follow_the_cursor_past_the_first_page():
    with mock_aws():
        table = boto3.resource("dynamodb", region_name="eu-central-1").create_table(
            TableName="t", BillingMode="PAY_PER_REQUEST",
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"},
                       {"AttributeName": "sk", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"},
                                  {"AttributeName": "sk", "AttributeType": "S"}])
        for n in range(3):
            table.put_item(Item={"pk": "u", "sk": str(n)})
        # One item per page stands in for DynamoDB's 1 MB page limit.
        query = {"KeyConditionExpression": Key("pk").eq("u"), "Limit": 1}
        assert [item["sk"] for item in query_all(table, **query)] == ["0", "1", "2"]
        assert count_all(table, **query) == 3
