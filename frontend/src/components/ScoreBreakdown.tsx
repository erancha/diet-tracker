import { useEffect, useRef } from "react";
import { clockTimeOf, fallsOn } from "../dates";
import { FRUIT_ESCALATION_CHOICE, carbsScales, mealTerms, type ScoreTerm } from "../derive";
import { choiceLabel } from "../gradeLabels";
import type { Meal, Question, Questionnaire, TreatDaySettings } from "../types";
import { isViolating, ruleBoundLabel } from "../violations";

// How long the breakdown stays before withdrawing on its own: long enough to read a full day's
// terms, short enough that the log is back by the next glance.
const BREAKDOWN_MS = 30_000;

// The day's carb score shown as the sum it is: every meal in time order, each priced term by term
// — grade at its helping, second source, second-fruit escalation, additions at their amounts —
// down to the day's total beside the bound it crossed. Grades read at full length with their
// examples whatever density the tracker is set to: the point here is to name what cost what. The
// score link that opened it is the one control that puts the meal list back, so the card reads as
// a page of figures rather than a dialog; it also asks to close after half a minute, so a reader
// who wandered off finds the log back.
export function ScoreBreakdown({ questionnaire, treatDay, date, meals, onExpire }: {
  questionnaire: Questionnaire;
  treatDay: TreatDaySettings;
  // The day the meals belong to; the sum is painted by the day rule as the dashboard paints the
  // score, a treat-day crossing softened the same way.
  date: string;
  meals: Meal[];
  // Called once, half a minute after the card opened, unless it was closed before then.
  onExpire: () => void;
}) {
  // The latest handler is read when the timer fires, so a re-render mid-count — a clock tick, a
  // meal saved — neither restarts the half minute nor calls a stale closure.
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => {
    const timer = setTimeout(() => expire.current(), BREAKDOWN_MS);
    return () => clearTimeout(timer);
  }, []);
  const carbsQuestion = questionnaire.questions.find((q) => q.id === "carbs")!;
  const { weights, additionValues, amounts, portions, secondSource, excluded } = carbsScales(carbsQuestion);
  const chronological = [...meals].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const terms = mealTerms(chronological, weights, additionValues, amounts, portions, secondSource, excluded);
  const total = terms.flat().reduce((sum, t) => sum + t.points, 0);
  const sumClass = !isViolating(questionnaire, carbsQuestion.id, total) ? "score"
    : fallsOn(date, treatDay.weekday) ? "score heavy-day treat-day" : "score heavy-day";
  return (
    <section className="score-breakdown">
      <h4>פירוט הציון</h4>
      <ol>
        {chronological.map((meal, index) => (
          <li key={meal.id}>
            <strong className="meal-at">{clockTimeOf(meal.at)}</strong>
            <div className="breakdown-terms">
              {terms[index].map((term, i) => (
                <div key={i} className="breakdown-term">
                  <span className="breakdown-label">{termLabel(carbsQuestion, term)}</span>
                  <span className="breakdown-points">{i === 0 ? "" : "+ "}{pointsLabel(term.points)}</span>
                </div>
              ))}
              <div className="breakdown-term breakdown-meal-total">
                <span />
                <span className="breakdown-points score">= {pointsLabel(terms[index].reduce((sum, t) => sum + t.points, 0))}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="breakdown-sum">
        סה״כ: <span className={sumClass}>{pointsLabel(total)}</span>
        {" · "}הגבול: {ruleBoundLabel(questionnaire, carbsQuestion.id)}
      </p>
    </section>
  );
}

// Terms are priced in fractions the grades never show — a reduced helping, a small amount — so
// they read to one decimal, enough for the column to visibly add up.
function pointsLabel(points: number): string {
  return String(Math.round(points * 10) / 10);
}

function scaleLabel(options: { id: string; label: string }[], id: string): string {
  const option = options.find((o) => o.id === id);
  if (option === undefined) throw new Error(`unknown scale step ${id}`);
  return option.label;
}

// A choice id a later questionnaire retired reads as the raw id, as the meal list shows it.
function gradeLabel(question: Question, choiceId: string): string {
  const choice = question.choices.find((c) => c.id === choiceId);
  return choice === undefined ? choiceId : choiceLabel(choice, true);
}

function termLabel(question: Question, term: ScoreTerm): string {
  switch (term.kind) {
    case "source":
      return term.portion === null ? gradeLabel(question, term.choice)
        : `${gradeLabel(question, term.choice)} · ${scaleLabel(question.portions!.options, term.portion)}`;
    case "second_source":
      return `מקור שני: ${gradeLabel(question, term.choice)} · ${term.merged
        ? "נבלע בדרגה הגבוהה" : scaleLabel(question.portions!.options, term.portion!)}`;
    case "fruit_escalation":
      return `פרי נוסף · נספר כ${gradeLabel(question, FRUIT_ESCALATION_CHOICE)}`;
    case "addition": {
      const addition = question.additions!.find((a) => a.id === term.id);
      const label = addition === undefined ? term.id : addition.label;
      return term.amount === null ? label : `${label} · ${scaleLabel(question.amounts!.options, term.amount)}`;
    }
  }
}
