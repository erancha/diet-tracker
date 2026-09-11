"""Consistency checks on the deployment template that only a deploy would otherwise reveal."""

from pathlib import Path

import yaml

TEMPLATE = Path(__file__).parent.parent / "scripts" / "template.yaml"
DEPLOY = Path(__file__).parent.parent / "scripts" / "deploy.sh"


class _CloudFormationLoader(yaml.SafeLoader):
    """Reads a SAM template as plain data: CloudFormation's shorthand tags (!Ref, !Sub, !GetAtt)
    carry no meaning for these checks, so every tag collapses to its scalar or collection."""


_CloudFormationLoader.add_multi_constructor(
    "!", lambda loader, suffix, node: node.value if isinstance(node, yaml.ScalarNode)
    else loader.construct_sequence(node) if isinstance(node, yaml.SequenceNode)
    else loader.construct_mapping(node))


def _api_function():
    template = yaml.load(TEMPLATE.read_text(), Loader=_CloudFormationLoader)
    return template["Resources"]["ApiFunction"], template["Resources"]["Api"]


def test_every_routed_method_is_allowed_by_the_apis_cors_rules():
    api_function, api = _api_function()
    routed = {event["Properties"]["Method"]
              for event in api_function["Properties"]["Events"].values()
              if event["Type"] == "HttpApi"}
    allowed = set(api["Properties"]["CorsConfiguration"]["AllowMethods"])
    assert routed - allowed == set()


def _load_template():
    return yaml.load(TEMPLATE.read_text(), Loader=_CloudFormationLoader)


def test_admin_listing_is_routed_gated_and_granted_pool_access():
    # The admin activity route needs four things wired together: the route itself, the address
    # the caller is recognized by, the right to enumerate the pool, and the right to count chat
    # turns — a missing one surfaces only when the admin opens the listing on a deployed stack.
    template = _load_template()
    api_function = template["Resources"]["ApiFunction"]["Properties"]
    routes = {(e["Properties"]["Method"], e["Properties"]["Path"])
              for e in api_function["Events"].values() if e["Type"] == "HttpApi"}
    assert ("GET", "/admin/activity") in routes
    assert api_function["Environment"]["Variables"]["ADMIN_EMAIL"] == "AdminEmail"
    assert "ListUsersPolicy" in api_function["Policies"]
    assert {"DynamoDBReadPolicy": {"TableName": "ChatHistoryTable"}} in api_function["Policies"]
    assert any(statement["Action"] == "ses:GetIdentityVerificationAttributes"
               for policy in api_function["Policies"] if isinstance(policy, dict)
               for statement in policy.get("Statement", []))
    assert "ListUsersPolicy" in template["Resources"]["NudgeFunction"]["Properties"]["Policies"]
    assert "AdminEmail=" in DEPLOY.read_text()


def test_chat_function_can_address_the_admin_quota_notice():
    # The quota notice needs the admin's address and the SES grant on the same function; a
    # missing one surfaces only when a deployed user first crosses the limit.
    chat_function = _load_template()["Resources"]["ChatFunction"]["Properties"]
    assert chat_function["Environment"]["Variables"]["ADMIN_EMAIL"] == "AdminEmail"
    assert "NotifyPolicy" in chat_function["Policies"]


def test_chat_function_reads_every_table_the_context_block_queries():
    # The chat context block attaches the asker's days, meals and weights; a table missing from
    # the read grants surfaces only as a 500 on a deployed stack's first chat question.
    policies = _load_template()["Resources"]["ChatFunction"]["Properties"]["Policies"]
    for table in ("DaysTable", "MealsTable", "WeightsTable"):
        assert {"DynamoDBReadPolicy": {"TableName": table}} in policies


def test_the_recap_consumer_is_granted_every_table_and_service_one_recap_touches():
    # A recap reads the user's days, meals and weights, replaces its own chat in the transcript
    # with the answered follow-up (a delete and a put in one transaction), and keeps a refused
    # email for the app; a missing grant surfaces only as a dead-lettered user on a deployed
    # stack, after the scheduler has long returned.
    policies = _load_template()["Resources"]["WeeklyRecapFunction"]["Properties"]["Policies"]
    for table in ("DaysTable", "MealsTable", "WeightsTable"):
        assert {"DynamoDBReadPolicy": {"TableName": table}} in policies
    assert {"DynamoDBCrudPolicy": {"TableName": "ChatHistoryTable"}} in policies
    assert {"DynamoDBWritePolicy": {"TableName": "UndeliveredTable"}} in policies
    assert "NotifyPolicy" in policies
    assert "ListUsersPolicy" not in policies


def test_the_weekly_recap_is_fanned_out_one_user_per_invocation():
    # The weekly job queues one message per user and a consumer answers each in its own
    # invocation. The pieces that keep that true — one message per invocation, a crash going
    # straight to the dead-letter queue, the consumer's wait fitting inside the queue's
    # visibility window, the scheduler's right to queue — fail only on a deployed stack.
    from handlers import nudge

    template = _load_template()
    resources = template["Resources"]
    consumer = resources["WeeklyRecapFunction"]["Properties"]
    assert getattr(nudge, consumer["Handler"].split(".")[-1])
    (event,) = consumer["Events"].values()
    assert event["Type"] == "SQS"
    assert event["Properties"]["Queue"] == "WeeklyRecapQueue.Arn"
    assert event["Properties"]["BatchSize"] == 1
    assert event["Properties"]["ScalingConfig"]["MaximumConcurrency"] == 2
    queue = resources["WeeklyRecapQueue"]["Properties"]
    assert queue["RedrivePolicy"] == {"deadLetterTargetArn": "WeeklyRecapDeadLetterQueue.Arn",
                                      "maxReceiveCount": 1}
    assert queue["VisibilityTimeout"] >= 6 * consumer["Timeout"]
    assert consumer["Timeout"] > nudge.RECAP_TIMEOUT_SECONDS
    nudge_policies = resources["NudgeFunction"]["Properties"]["Policies"]
    assert {"SQSSendMessagePolicy": {"QueueName": "WeeklyRecapQueue.QueueName"}} in nudge_policies
    shared_variables = template["Globals"]["Function"]["Environment"]["Variables"]
    assert shared_variables["WEEKLY_RECAP_QUEUE_URL"] == "WeeklyRecapQueue"


def test_weigh_in_schedule_defaults_agree_with_the_app_config():
    # deploy.sh passes config/app.json's weigh-in slot as parameter overrides, so the template's
    # own defaults never reach a deployed stack. Left to drift they would still mislead anyone
    # reading the template for when the reminder fires.
    from common import appconfig

    from conftest import APP_CONFIG
    parameters = _load_template()["Parameters"]
    weigh_in = appconfig.load(APP_CONFIG).weight.weigh_in
    assert parameters["WeighInWeekday"]["Default"] == weigh_in.weekday
    assert parameters["WeighInHour"]["Default"] == weigh_in.hour


def test_weekly_recap_fires_on_the_weigh_in_weekday():
    # The recap is timed to read the weigh-in morning's weight. Spelling the weekday out here
    # instead of reusing the parameter would let a retargeted weigh-in leave the recap behind on
    # the old night, reading a week-old weight.
    schedule = _load_template()["Resources"]["WeeklySchedule"]
    assert "${WeighInWeekday}" in schedule["Properties"]["ScheduleExpression"]


def test_every_scheduled_job_name_is_one_the_nudge_handler_dispatches():
    # A schedule invoking a job the handler has no entry for fails only when it fires, hours or
    # days after the deploy that introduced it.
    import json

    from handlers import nudge

    template = _load_template()
    scheduled = {json.loads(resource["Properties"]["Target"]["Input"])["job"]
                 for resource in template["Resources"].values()
                 if resource["Type"] == "AWS::Scheduler::Schedule"}
    assert scheduled == {"last_call", "rules", "weekly", "weigh_in"}


def test_every_parameter_a_schedule_reads_is_passed_on_deploy():
    # CloudFormation keeps a stack's previous parameter value for every parameter a deploy does
    # not pass, so a changed template default never reaches a stack that already exists. A cron
    # built from a parameter must therefore have it passed on every deploy, or a retired hour goes
    # on firing against code that no longer expects it.
    import re

    template = _load_template()
    read_by_a_cron = {name
                      for resource in template["Resources"].values()
                      if resource["Type"] == "AWS::Scheduler::Schedule"
                      for name in re.findall(r"\$\{(\w+)\}",
                                             resource["Properties"]["ScheduleExpression"])}
    deploy = DEPLOY.read_text()
    assert [name for name in sorted(read_by_a_cron) if f"{name}=" not in deploy] == []
