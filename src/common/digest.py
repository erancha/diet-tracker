"""Renders the weekly Hebrew digest — submission count, per-question weekly averages, and how
many submitted days had no rule-violating value — and composes the question that asks the RAG
service for an LLM-written recap of the same week."""

import json

from common.chat import MAX_QUESTION_CHARS

_SUMMARY_INSTRUCTION = (
    "לפניך נתוני מעקב תזונה של משתמש מהשבוע האחרון (JSON). "
    "כתוב בעברית פסקה קצרה המסכמת איך עבר השבוע, ולאחריה 1-2 המלצות מעשיות לשבוע הבא, "
    "בהתבסס על הנחיות התזונה."
)


def _violates_any(questionnaire, answers: dict) -> bool:
    return any(
        # A day recorded before a question existed is legal and cannot violate that question's rules.
        rule.question_id in answers and rule.violates(answers[rule.question_id])
        for rule in questionnaire.rules
    )


def weekly_text(questionnaire, history: dict) -> str:
    if not history:
        return "לא נסגרו ימים השבוע"
    days = len(history)
    lines = [f"סיכום שבועי — נסגרו {days} מתוך 7 ימים", ""]
    for question in questionnaire.questions:
        values = [answers[question.id] for answers in history.values() if question.id in answers]
        if values:
            lines.append(f"{question.day_title}: ממוצע {round(sum(values) / len(values), 1):g}")
    clean = sum(1 for answers in history.values() if not _violates_any(questionnaire, answers))
    lines += ["", f"ימים ללא חריגה: {clean} מתוך {days}"]
    return "\n".join(lines)


def labeled_history(questionnaire, history: dict) -> dict:
    """The submitted answers keyed by date, each value under its question's Hebrew day-scope
    heading — the vocabulary the answering LLM reads instead of internal question ids."""
    return {date: {questionnaire.question(question_id).day_title: value
                   for question_id, value in answers.items()}
            for date, answers in history.items()}


def weekly_summary_question(questionnaire, history: dict) -> str:
    """The RAG question asking for a recap of the user's week plus next-week tips, grounded in
    the week's labeled data. Sheds the oldest days when needed to honor the upstream cap."""
    data = labeled_history(questionnaire, history)
    while True:
        question = f"{_SUMMARY_INSTRUCTION}\n{json.dumps(data, ensure_ascii=False)}"
        if len(question) <= MAX_QUESTION_CHARS:
            return question
        del data[min(data)]
