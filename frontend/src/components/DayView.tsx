import { useState } from "react";
import type { DayPayload, Questionnaire, TreatDaySettings } from "../types";
import { weekdayDdmmLabel } from "../dates";
import { DayDashboard } from "./DayDashboard";
import { Icon } from "./Icon";
import { MealList } from "./MealList";
import { ScoreBreakdown } from "./ScoreBreakdown";

// Read-only look at a submitted day's tracker: the derived-values dashboard and the meal list, or
// the score's breakdown in the list's place while a heavy score is being accounted for. The view
// always opens on the list; the breakdown is reached from its score alone, as in the tracker. A
// day without recorded meals says so explicitly instead of showing an all-zero dashboard.
export function DayView({ questionnaire, treatDay, day, expandLabels, onClose }: {
  questionnaire: Questionnaire;
  treatDay: TreatDaySettings;
  day: DayPayload;
  // A history day's rows read at the density the account menu sets for the tracker, so the two
  // never disagree on how a grade is named.
  expandLabels: boolean;
  onClose: () => void;
}) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
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
                        derived={day.derived} meals={day.meals}
                        onScoreClick={() => setBreakdownOpen((open) => !open)} />
          {breakdownOpen
            ? <ScoreBreakdown questionnaire={questionnaire} treatDay={treatDay} date={day.date} meals={day.meals}
                        onExpire={() => setBreakdownOpen(false)} />
            : <MealList questionnaire={questionnaire} meals={day.meals} expandLabels={expandLabels} />}
        </>
      )}
    </section>
  );
}
