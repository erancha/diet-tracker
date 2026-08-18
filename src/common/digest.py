"""Renders the weekly Hebrew digest: submission count, per-question choice distribution,
and how many submitted days had no rule-violating answer."""

from collections import Counter

from common.rules import selected_ids


def _violates_any(questionnaire, answers: dict) -> bool:
    return any(
        # A day recorded before a question existed is legal and cannot violate that question's rules.
        rule.question_id in answers and selected_ids(answers[rule.question_id]) & rule.violating_choice_ids
        for rule in questionnaire.rules
    )


def weekly_text(questionnaire, history: dict) -> str:
    if not history:
        return "לא מולאו שאלונים השבוע"
    days = len(history)
    lines = [f"סיכום שבועי — מולאו {days} מתוך 7 ימים", ""]
    for question in questionnaire.questions:
        counts = Counter(
            choice_id
            for answers in history.values() if question.id in answers
            for choice_id in selected_ids(answers[question.id])
        )
        distribution = ", ".join(
            f"{question.choice_label(choice_id)}: {n}" for choice_id, n in counts.most_common()
        )
        lines.append(f"{question.text} {distribution}")
    clean = sum(1 for answers in history.values() if not _violates_any(questionnaire, answers))
    lines += ["", f"ימים ללא חריגה: {clean} מתוך {days}"]
    return "\n".join(lines)
