import pytest

from common import chat_history


@pytest.fixture
def table(ddb):
    return ddb.Table("chat_history")


def test_an_appended_turn_comes_back_complete(table):
    sources = [{"fileName": "מדריך.pdf", "score": 0.83}]
    chat_history.append(table, "u1", "כמה פחמימות מותר ביום?", "עד 4 נקודות", sources)

    (turn,) = chat_history.turns(table, "u1")
    assert turn["question"] == "כמה פחמימות מותר ביום?"
    assert turn["answer"] == "עד 4 נקודות"
    assert turn["sources"] == sources
    assert "T" in turn["at"]


def test_turns_come_newest_first_and_only_for_the_asking_user(table):
    chat_history.append(table, "u1", "ראשונה", "ת1", [])
    chat_history.append(table, "u2", "של אחר", "ת", [])
    chat_history.append(table, "u1", "שנייה", "ת2", [])

    questions = [turn["question"] for turn in chat_history.turns(table, "u1")]
    assert questions == ["שנייה", "ראשונה"]


def test_append_returns_the_stored_sort_key(table):
    at = chat_history.append(table, "u1", "שאלה?", "תשובה", [])

    (turn,) = chat_history.turns(table, "u1")
    assert turn["at"] == at


def test_a_follow_up_replaces_the_turn_whole_under_a_fresh_key(table):
    at = chat_history.append(table, "u1", "שאלה מקורית", "תשובה ראשונה", [])

    returned = chat_history.append(table, "u1", "שרשור מלא", "תשובה חדשה",
                                   [{"fileName": "מדריך.pdf", "score": 0.9}], at=at)

    assert returned > at
    (turn,) = chat_history.turns(table, "u1")
    assert turn == {"question": "שרשור מלא", "answer": "תשובה חדשה", "summarized": False,
                    "app": False, "sources": [{"fileName": "מדריך.pdf", "score": 0.9}],
                    "at": returned}


def test_a_follow_up_moves_the_turn_to_the_top_of_the_transcript(table):
    first = chat_history.append(table, "u1", "ראשונה", "ת1", [])
    chat_history.append(table, "u1", "שנייה", "ת2", [])

    followed = chat_history.append(table, "u1", "שרשור", "ת3", [], at=first)

    turns = chat_history.turns(table, "u1")
    assert [turn["question"] for turn in turns] == ["שרשור", "שנייה"]
    assert turns[0]["at"] == followed
    assert followed > first
    assert first not in [turn["at"] for turn in turns]


def test_append_with_an_at_that_holds_no_turn_raises(table):
    with pytest.raises(KeyError):
        chat_history.append(table, "u1", "שאלת המשך", "תשובה", [], at="2026-09-01T10:00:00+00:00")

    assert chat_history.turns(table, "u1") == []


def test_append_with_an_at_cannot_touch_another_users_turn(table):
    at = chat_history.append(table, "u1", "שאלה", "תשובה", [])

    with pytest.raises(KeyError):
        chat_history.append(table, "u2", "שרשור", "ת", [], at=at)

    assert [turn["question"] for turn in chat_history.turns(table, "u1")] == ["שאלה"]
    assert chat_history.turns(table, "u2") == []


def test_delete_removes_only_the_named_turn(table):
    kept = chat_history.append(table, "u1", "נשארת", "ת", [])
    removed = chat_history.append(table, "u1", "נמחקת", "ת", [])
    chat_history.append(table, "u2", "של אחר", "ת", [])

    chat_history.delete(table, "u1", removed)

    assert [turn["at"] for turn in chat_history.turns(table, "u1")] == [kept]
    assert [turn["question"] for turn in chat_history.turns(table, "u2")] == ["של אחר"]


def test_delete_of_a_missing_turn_raises(table):
    at = chat_history.append(table, "u1", "שאלה?", "תשובה", [])

    with pytest.raises(KeyError):
        chat_history.delete(table, "u2", at)


def test_count_range_covers_whole_boundary_days_for_the_asking_user_alone(table):
    for sk in ("2026-08-29T00:00:00+00:00", "2026-09-04T23:59:59+00:00"):
        table.put_item(Item={"pk": "u1", "sk": sk, "question": "ש", "answer": "ת",
                             "sources": "[]"})
    table.put_item(Item={"pk": "u1", "sk": "2026-08-28T23:59:59+00:00", "question": "ש",
                         "answer": "ת", "sources": "[]"})
    table.put_item(Item={"pk": "u2", "sk": "2026-08-30T12:00:00+00:00", "question": "ש",
                         "answer": "ת", "sources": "[]"})

    assert chat_history.count_range(table, "u1", "2026-08-29", "2026-09-04") == 2
    assert chat_history.count_range(table, "u2", "2026-08-29", "2026-09-04") == 1


def test_count_spans_the_users_whole_transcript(table):
    chat_history.append(table, "u1", "שאלה מהיום", "ת", [])
    table.put_item(Item={"pk": "u1", "sk": "2026-08-01T10:00:00+00:00",
                         "question": "ישנה", "answer": "ת", "sources": "[]"})
    chat_history.append(table, "u2", "של אחר", "ת", [])
    assert chat_history.count(table, "u1") == 2
    assert chat_history.count(table, "u2") == 1
    assert chat_history.count(table, "u3") == 0


def test_turns_follows_pagination_to_the_end():
    # A fake table standing in for DynamoDB's 1MB page cap, which moto cannot be made to hit
    # at reasonable test cost.
    class PagedTable:
        def __init__(self):
            self.seen_start_keys = []

        def query(self, **kwargs):
            self.seen_start_keys.append(kwargs.get("ExclusiveStartKey"))
            if kwargs.get("ExclusiveStartKey") is None:
                return {"Items": [{"question": "שנייה", "answer": "ת2", "sources": "[]",
                                   "sk": "2026-09-01T10:00:00"}],
                        "LastEvaluatedKey": {"pk": "u1", "sk": "2026-09-01T10:00:00"}}
            return {"Items": [{"question": "ראשונה", "answer": "ת1", "sources": "[]",
                               "sk": "2026-09-01T09:00:00"}]}

    paged = PagedTable()
    questions = [turn["question"] for turn in chat_history.turns(paged, "u1")]
    assert questions == ["שנייה", "ראשונה"]
    assert paged.seen_start_keys == [None, {"pk": "u1", "sk": "2026-09-01T10:00:00"}]


def test_get_returns_the_stored_turn(table):
    sources = [{"fileName": "מדריך.pdf", "score": 0.83}]
    at = chat_history.append(table, "u1", "שאלה?", "תשובה", sources)

    assert chat_history.get(table, "u1", at) == {"question": "שאלה?", "answer": "תשובה",
                                                 "sources": sources, "summarized": False,
                                                 "app": False, "at": at}


def test_get_of_a_missing_turn_raises(table):
    at = chat_history.append(table, "u1", "שאלה?", "תשובה", [])

    with pytest.raises(KeyError):
        chat_history.get(table, "u2", at)


def test_summarize_replaces_the_chain_in_place_under_the_same_key(table):
    at = chat_history.append(table, "u1", "השאלה המקורית: מה מותר?\nהתשובה: הרבה\nשאלת המשך: ולמה?",
                             "כי כך", [{"fileName": "מדריך.pdf", "score": 0.9}])

    chat_history.summarize(table, "u1", at, "מה מותר?", "השיחה עסקה במה שמותר לאכול")

    (turn,) = chat_history.turns(table, "u1")
    assert turn == {"question": "מה מותר?", "answer": "השיחה עסקה במה שמותר לאכול",
                    "sources": [], "summarized": True, "app": False, "at": at}


def test_summarize_of_a_missing_turn_raises_and_leaves_the_transcript_alone(table):
    at = chat_history.append(table, "u1", "שאלה", "תשובה", [])

    with pytest.raises(KeyError):
        chat_history.summarize(table, "u1", "2026-09-01T10:00:00+00:00", "ש", "סיכום")
    with pytest.raises(KeyError):
        chat_history.summarize(table, "u2", at, "ש", "סיכום")

    assert [turn["question"] for turn in chat_history.turns(table, "u1")] == ["שאלה"]
    assert chat_history.turns(table, "u2") == []


def test_summarize_marks_the_chat_as_digested(table):
    at = chat_history.append(table, "u1", "שאלה", "תשובה", [])
    assert chat_history.get(table, "u1", at)["summarized"] is False

    chat_history.summarize(table, "u1", at, "שאלה", "סיכום")

    assert chat_history.get(table, "u1", at)["summarized"] is True


def test_a_follow_up_on_a_summarized_chat_clears_the_digest_mark(table):
    at = chat_history.append(table, "u1", "שאלה", "תשובה", [])
    chat_history.summarize(table, "u1", at, "שאלה", "סיכום")

    followed = chat_history.append(table, "u1", "שרשור", "תשובת המשך", [], at=at)

    assert chat_history.get(table, "u1", followed)["summarized"] is False


def test_a_chat_the_app_wrote_is_marked_and_a_users_own_is_not(table):
    written = chat_history.append(table, "u1", "סיכום שבועי 07/09/2026", "ת", [], app=True)
    asked = chat_history.append(table, "u1", "שאלה שלי", "ת", [])

    assert chat_history.get(table, "u1", written)["app"] is True
    assert chat_history.get(table, "u1", asked)["app"] is False


def test_a_follow_up_carries_the_apps_mark_only_when_told_to(table):
    written = chat_history.append(table, "u1", "סיכום שבועי 07/09/2026", "ת", [], app=True)

    kept = chat_history.append(table, "u1", "שרשור", "ת", [], at=written, app=True)
    assert chat_history.get(table, "u1", kept)["app"] is True

    dropped = chat_history.append(table, "u1", "שרשור נוסף", "ת", [], at=kept)
    assert chat_history.get(table, "u1", dropped)["app"] is False


def test_summarizing_leaves_the_apps_mark_standing(table):
    at = chat_history.append(table, "u1", "סיכום שבועי 07/09/2026", "ת", [], app=True)

    chat_history.summarize(table, "u1", at, "סיכום שבועי 07/09/2026", "תקציר")

    assert chat_history.get(table, "u1", at)["app"] is True


def test_a_chat_stored_before_the_mark_existed_reads_as_the_users_own(table):
    table.put_item(Item={"pk": "u1", "sk": "2026-08-01T10:00:00+00:00", "question": "ישנה",
                         "answer": "ת", "sources": "[]"})

    (turn,) = chat_history.turns(table, "u1")
    assert turn["app"] is False


def test_a_follow_up_labels_a_standalone_question_as_the_conversations_opening():
    chained = chat_history.follow_up("מה זה יום פינוק?", "יום אחד בשבוע", "ואיך מתכוננים אליו?")
    assert chained == ("השאלה המקורית: מה זה יום פינוק?\n"
                       "התשובה: יום אחד בשבוע\n"
                       "שאלת המשך: ואיך מתכוננים אליו?")


def test_a_second_follow_up_keeps_the_chain_it_extends():
    """The chain grows by one exchange per follow-up; only a question that never opened one gets
    the opening label, so a conversation names its original question once."""
    first = chat_history.follow_up("מה זה יום פינוק?", "יום אחד בשבוע", "ואיך מתכוננים אליו?")

    second = chat_history.follow_up(first, "מקדימים ארוחה", "ומה עם למחרת?")

    assert second.count("השאלה המקורית:") == 1
    assert second.endswith("התשובה: מקדימים ארוחה\nשאלת המשך: ומה עם למחרת?")
