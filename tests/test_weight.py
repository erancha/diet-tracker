from conftest import APP_CONFIG

from common import appconfig, weight

LIMITS = appconfig.load(APP_CONFIG).weight.limits


def test_a_plausible_weight_is_accepted():
    assert weight.rejection(72, LIMITS) is None
    assert weight.rejection(72.4, LIMITS) is None
    assert weight.rejection(LIMITS.min_kg, LIMITS) is None
    assert weight.rejection(LIMITS.max_kg, LIMITS) is None


def test_a_misplaced_decimal_point_is_rejected_at_the_bounds():
    assert "between" in weight.rejection(LIMITS.min_kg - 0.1, LIMITS)
    assert "between" in weight.rejection(LIMITS.max_kg + 0.1, LIMITS)


def test_non_numbers_are_rejected_and_bool_is_not_a_number():
    assert "number" in weight.rejection("72", LIMITS)
    assert "number" in weight.rejection(None, LIMITS)
    assert "number" in weight.rejection(True, LIMITS)
