"""Renders the weekly Hebrew digest: submission count, per-question weekly averages, and how
many submitted days had no rule-violating value."""


def _violates_any(questionnaire, answers: dict) -> bool:
    return any(
        # A day recorded before a question existed is legal and cannot violate that question's rules.
        rule.question_id in answers and rule.violates(answers[rule.question_id])
        for rule in questionnaire.rules
    )


def weekly_text(questionnaire, history: dict) -> str:
    if not history:
        return "לא מולאו שאלונים השבוע"
    days = len(history)
    lines = [f"סיכום שבועי — מולאו {days} מתוך 7 ימים", ""]
    for question in questionnaire.questions:
        values = [answers[question.id] for answers in history.values() if question.id in answers]
        if values:
            lines.append(f"{question.text}: ממוצע {sum(values) / len(values):g}")
    clean = sum(1 for answers in history.values() if not _violates_any(questionnaire, answers))
    lines += ["", f"ימים ללא חריגה: {clean} מתוך {days}"]
    return "\n".join(lines)
