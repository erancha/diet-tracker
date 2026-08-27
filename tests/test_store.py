import pytest

from common import store as store_module
from common.store import Store

ANSWERS = {"drinking": 3, "vegetables": 2, "eating_window": 10.4, "meals": 3, "carbs": 12}


@pytest.fixture
def store(ddb):
    return Store("days", "meals", "state", "weights", dynamodb=ddb)


def test_day_roundtrip_preserves_numeric_answers_per_user(store):
    store.put_day("u1", "2026-08-19", ANSWERS, 3, "2026-08-19T21:00:00+03:00")
    store.put_day("u2", "2026-08-19", {**ANSWERS, "carbs": 1}, 3, "t")
    days = store.get_days_range("u1", "2026-08-01", "2026-08-19")
    assert days["2026-08-19"] == ANSWERS
    assert type(days["2026-08-19"]["meals"]) is int
    assert days["2026-08-19"]["eating_window"] == 10.4


def test_has_and_delete_day(store):
    assert not store.has_day("u1", "2026-08-19")
    store.put_day("u1", "2026-08-19", ANSWERS, 3, "t")
    assert store.has_day("u1", "2026-08-19")
    store.delete_day("u1", "2026-08-19")
    assert not store.has_day("u1", "2026-08-19")
    with pytest.raises(KeyError):
        store.delete_day("u1", "2026-08-19")


def test_meals_roundtrip_chronological_and_per_day(store):
    later = store.add_meal("u1", "2026-08-20", "2026-08-20T13:30:00+03:00", "carb_grade_4", True, False, ["sweet"], False)
    earlier = store.add_meal("u1", "2026-08-20", "2026-08-20T09:10:00+03:00", "no_carbs", True, True, [], False)
    store.add_meal("u1", "2026-08-19", "2026-08-19T09:00:00+03:00", "carb_grade_3", False, False, [], False)
    meals = store.get_meals("u1", "2026-08-20")
    assert [m["id"] for m in meals] == [earlier, later]
    assert meals[0] == {"id": earlier, "at": "2026-08-20T09:10:00+03:00",
                        "carbs_choice": "no_carbs", "vegetables": True, "fruit": True,
                        "additions": [], "small_portion": False}
    assert meals[1]["additions"] == ["sweet"]


def test_meal_stored_before_the_fruit_and_addition_flags_reads_them_as_absent(store, ddb):
    ddb.Table("meals").put_item(Item={
        "pk": "u1", "sk": "2026-08-20#09:10:00-abc123",
        "at": "2026-08-20T09:10:00+03:00", "carbs_choice": "carb_grade_3", "vegetables": True})
    meal = store.get_meals("u1", "2026-08-20")[0]
    assert meal["fruit"] is False
    assert meal["additions"] == []


def test_meal_stored_with_the_legacy_sweet_flag_reads_as_a_sweet_addition(store, ddb):
    ddb.Table("meals").put_item(Item={
        "pk": "u1", "sk": "2026-08-20#09:10:00-abc123",
        "at": "2026-08-20T09:10:00+03:00", "carbs_choice": "carb_grade_3", "vegetables": True,
        "fruit": False, "sweet": True})
    assert store.get_meals("u1", "2026-08-20")[0]["additions"] == ["sweet"]


def _store_meal(ddb, carbs_choice, additions):
    ddb.Table("meals").put_item(Item={
        "pk": "u1", "sk": "2026-08-20#09:10:00-abc123",
        "at": "2026-08-20T09:10:00+03:00", "carbs_choice": carbs_choice, "vegetables": True,
        "fruit": False, "additions": additions, "small_portion": False})


# The map is empty: the meals recorded under the grades retired so far were migrated to the
# current ids in the table itself. These pin the reading a future retirement will rely on.
def test_a_meal_under_a_retired_grade_reads_as_the_grade_that_replaced_it(store, ddb, monkeypatch):
    monkeypatch.setitem(store_module._RETIRED_GRADES, "retired_heavy", ("no_carbs", "fat"))
    _store_meal(ddb, "retired_heavy", [])
    meal = store.get_meals("u1", "2026-08-20")[0]
    assert meal["carbs_choice"] == "no_carbs"
    assert meal["additions"] == ["fat"]


def test_a_retired_grade_keeps_the_additions_already_recorded_beside_it(store, ddb, monkeypatch):
    monkeypatch.setitem(store_module._RETIRED_GRADES, "retired_heavy", ("no_carbs", "fat"))
    _store_meal(ddb, "retired_heavy", ["sweet"])
    assert store.get_meals("u1", "2026-08-20")[0]["additions"] == ["sweet", "fat"]


def test_a_retired_grade_needing_no_addition_maps_to_the_grade_alone(store, ddb, monkeypatch):
    monkeypatch.setitem(store_module._RETIRED_GRADES, "retired_plain", ("carb_grade_7", None))
    _store_meal(ddb, "retired_plain", ["sweet"])
    meal = store.get_meals("u1", "2026-08-20")[0]
    assert meal["carbs_choice"] == "carb_grade_7"
    assert meal["additions"] == ["sweet"]


def test_no_grade_is_retired_today_because_the_stored_meals_were_migrated(store):
    assert store_module._RETIRED_GRADES == {}


def test_same_second_meals_get_distinct_ids(store):
    ids = {store.add_meal("u1", "2026-08-20", "2026-08-20T12:00:00+03:00", "carb_grade_3", False, False, [], False)
           for _ in range(5)}
    assert len(ids) == 5
    assert len(store.get_meals("u1", "2026-08-20")) == 5


def test_delete_meal(store):
    meal_id = store.add_meal("u1", "2026-08-20", "2026-08-20T12:00:00+03:00", "carb_grade_3", False, False, [], False)
    store.delete_meal("u1", "2026-08-20", meal_id)
    assert store.get_meals("u1", "2026-08-20") == []
    with pytest.raises(KeyError):
        store.delete_meal("u1", "2026-08-20", meal_id)


def test_replace_meal_rewrites_every_field_and_reorders_an_edited_time(store):
    edited = store.add_meal("u1", "2026-08-20", "2026-08-20T13:30:00+03:00", "carb_grade_4", False, False, [], False)
    store.add_meal("u1", "2026-08-20", "2026-08-20T18:00:00+03:00", "carb_grade_3", False, False, [], False)
    new_id = store.replace_meal("u1", "2026-08-20", edited, "2026-08-20T09:10:00+03:00",
                                "no_carbs", True, True, ["sweet"], False)
    meals = store.get_meals("u1", "2026-08-20")
    assert [m["id"] for m in meals][0] == new_id
    assert meals[0] == {"id": new_id, "at": "2026-08-20T09:10:00+03:00", "carbs_choice": "no_carbs",
                        "vegetables": True, "fruit": True, "additions": ["sweet"], "small_portion": False}
    assert len(meals) == 2


def test_replace_meal_leaves_no_trace_of_an_unknown_meal(store):
    with pytest.raises(KeyError):
        store.replace_meal("u1", "2026-08-20", "12:00:00-abcdef", "2026-08-20T12:00:00+03:00",
                           "carb_grade_3", False, False, [], False)
    assert store.get_meals("u1", "2026-08-20") == []


def test_nudge_state_roundtrip_with_legal_empty_default(store):
    assert store.get_nudge_state("u1") == {"rules": {}}
    store.put_nudge_state("u1", {"rules": {"heavy_carbs": {"last_alert_for": "2026-08-19"}}})
    assert store.get_nudge_state("u1")["rules"]["heavy_carbs"]["last_alert_for"] == "2026-08-19"


def test_weight_roundtrip_is_per_day_and_per_user(store):
    store.put_weight("u1", "2026-08-20", 77.4)
    store.put_weight("u1", "2026-08-27", 76)
    store.put_weight("u2", "2026-08-27", 90)
    assert store.get_weights("u1") == {"2026-08-20": 77.4, "2026-08-27": 76}
    assert type(store.get_weights("u1")["2026-08-27"]) is int


def test_re_recording_a_day_replaces_its_weight(store):
    store.put_weight("u1", "2026-08-27", 777)
    store.put_weight("u1", "2026-08-27", 77.7)
    assert store.get_weights("u1") == {"2026-08-27": 77.7}


def test_the_target_stays_out_of_every_measurement_query(store):
    store.put_target("u1", 72)
    store.put_weight("u1", "2026-08-27", 76)
    assert store.get_weights("u1") == {"2026-08-27": 76}
    assert store.get_weights_range("u1", "2026-08-21", "2026-08-27") == {"2026-08-27": 76}
    assert store.get_target("u1") == 72


def test_an_unset_target_reads_as_absent(store):
    assert store.get_target("u1") is None


def test_setting_the_target_replaces_the_previous_one(store):
    store.put_target("u1", 72)
    store.put_target("u1", 70.5)
    assert store.get_target("u1") == 70.5


def test_weights_range_bounds_are_inclusive(store):
    for day in ("2026-08-19", "2026-08-20", "2026-08-27", "2026-08-28"):
        store.put_weight("u1", day, 77)
    assert sorted(store.get_weights_range("u1", "2026-08-20", "2026-08-27")) == [
        "2026-08-20", "2026-08-27"]


def test_deleting_a_weight_removes_only_that_day(store):
    store.put_weight("u1", "2026-08-20", 77)
    store.put_weight("u1", "2026-08-27", 76)
    store.delete_weight("u1", "2026-08-20")
    assert store.get_weights("u1") == {"2026-08-27": 76}


def test_deleting_a_day_that_holds_no_weight_raises(store):
    with pytest.raises(KeyError):
        store.delete_weight("u1", "2026-08-27")
