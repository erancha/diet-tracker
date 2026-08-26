import type { DayPayload, Questionnaire } from "../types";
import { weekdayDdmmLabel } from "../dates";
import { DayDashboard } from "./DayDashboard";
import { Icon } from "./Icon";
import { MealList } from "./MealList";

// Read-only look at a submitted day's tracker: the derived-values dashboard and the meal list. A day
// without recorded meals says so explicitly instead of showing an all-zero dashboard.
export function DayView({ questionnaire, day, onClose }: {
  questionnaire: Questionnaire;
  day: DayPayload;
  onClose: () => void;
}) {
  return (
    <section className="day-view">
      <header>
        <h3>יומן {weekdayDdmmLabel(day.date)}</h3>
        <button type="button" className="icon-only" aria-label="סגירת התצוגה" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      {day.meals.length === 0 ? (
        <p>לא נרשמו ארוחות ביום זה</p>
      ) : (
        <>
          <DayDashboard questionnaire={questionnaire} derived={day.derived} />
          <MealList questionnaire={questionnaire} meals={day.meals} />
        </>
      )}
    </section>
  );
}
