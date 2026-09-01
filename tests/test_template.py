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
