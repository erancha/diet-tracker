"""Consistency checks on the deployment template that only a deploy would otherwise reveal."""

from pathlib import Path

import yaml

TEMPLATE = Path(__file__).parent.parent / "scripts" / "template.yaml"


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
