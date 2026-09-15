import { useState } from "react";
import type { DayPayload, Questionnaire, TreatDaySettings } from "../types";
import { weekdayDdmmLabel } from "../dates";
import { useExpandedGradeLabels } from "../gradeLabels";
import { DayDashboard } from "./DayDashboard";
import { Icon } from "./Icon";
import { MealList } from "./MealList";
import { ScoreBreakdown } from "./ScoreBreakdown";

// Read-only look at a submitted day's tracker: the derived-values dashboard and the meal list, or
// the score's breakdown in the list's place while a heavy score is being accounted for. The view
// always opens on the list; the breakdown is reached from its score alone, as in the tracker. A
// day without recorded meals says so explicitly instead of showing an all-zero dashboard.
export function DayView({ questionnaire, treatDay, day, onClose }: {
  questionnaire: Questionnaire;
  treatDay: TreatDaySettings;
  day: DayPayload;
  onClose: () => void;
}) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  // A history day's rows read at the density the tracker was left at; the switch that sets it
  // lives there, so this view follows rather than offering a second one.
  const [expandLabels] = useExpandedGradeLabels();
  return (
    <section className="day-view">
      <header>
        <h3>יומן {weekdayDdmmLabel(day.date)}</h3>
        <button type="button" className="glyph" aria-label="סגירת התצוגה" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      {day.meals.length === 0 ? (
        <p>לא נרשמו ארוחות ביום זה</p>
      ) : (
        <>
          <DayDashboard questionnaire={questionnaire} treatDay={treatDay} date={day.date}
                        derived={day.derived} onScoreClick={() => setBreakdownOpen((open) => !open)} />
          {breakdownOpen
            ? <ScoreBreakdown questionnaire={questionnaire} treatDay={treatDay} date={day.date} meals={day.meals}
                        onExpire={() => setBreakdownOpen(false)} />
            : <MealList questionnaire={questionnaire} meals={day.meals} expandLabels={expandLabels} />}
        </>
      )}
    </section>
  );
}
