import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { alertMessage, type Api } from "../api";
import { activeViolations } from "../violations";
import type { AnswerValue, NewMeal, Questionnaire } from "../types";
import { dayEnded, defaultDay, expandQuestionnaire, isoDate, yesterdayOf } from "../dates";
import { Alerts, type AlertItem } from "./Alerts";
import { CollapsibleSection } from "./CollapsibleSection";
import { DayPicker, type DayChoice } from "./DayPicker";
import { DayTracker } from "./DayTracker";
import { DayView } from "./DayView";
import { Header } from "./Header";
import { HistoryTable } from "./HistoryTable";
import { QuestionnaireForm } from "./QuestionnaireForm";
import { TrendChart } from "./TrendChart";

// Top-level screen: owns the server data (questionnaire config, day history, today's and
// yesterday's meal payloads, on-demand past-day payloads) and every mutation — meal recording
// and deletion, day submission with tracked floors, day deletion — plus the submit → alerts flow
// and the day-end section's fold it closes; the components below it hold no server state of their
// own.
export function App({ email, api, reminderHour, firstMealHour, onSignOut }: {
  email: string; api: Api; reminderHour: number; firstMealHour: number; onSignOut: () => void;
}) {
  const queryClient = useQueryClient();
  const [now] = useState(() => new Date());
  const todayStr = isoDate(now);
  const yesterdayStr = isoDate(yesterdayOf(now));

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  // Stable so the alert strip's dismissal timer is not restarted by every re-render of this screen.
  const dismissAlerts = useCallback(() => setAlerts([]), []);
  // The day-end section's fold once something has set it — the user's own toggle, or a submission
  // folding the answered form away behind its confirmation. Null until then, because the fold the
  // section opens on reads the day's state, which is not known before the history loads.
  const [questionnaireCollapsed, setQuestionnaireCollapsed] = useState<boolean | null>(null);
  const todaySelectable = dayEnded(now, reminderHour);
  const [day, setDay] = useState<DayChoice>(() => defaultDay(now, reminderHour));

  const questionnaireQuery = useQuery({
    queryKey: ["questionnaire"],
    queryFn: async (): Promise<Questionnaire> => {
      const response = await fetch("questionnaire.json");
      if (!response.ok) throw new Error(`questionnaire.json → ${response.status}`);
      return response.json();
    },
    staleTime: Infinity,
  });
  const historyQuery = useQuery({ queryKey: ["days"], queryFn: api.getDays });

  // The history row whose read-only day view is open, or null when none is.
  const [viewedDate, setViewedDate] = useState<string | null>(null);
  const viewedDayQuery = useQuery({
    queryKey: ["day", viewedDate],
    queryFn: () => api.getDay(viewedDate!),
    enabled: viewedDate !== null,
  });

  const errorAlert = (action: string) => (error: Error) =>
    setAlerts([{ kind: "alert", message: alertMessage(action, error) }]);

  const submitMutation = useMutation({
    mutationFn: api.submitDay,
    onSuccess: (result) => {
      // A violated day is still a saved day, so the confirmation leads either way — the folded
      // form would otherwise be the only sign the answers went through.
      const saved = `נשמר לתאריך ${result.date}!`;
      setAlerts(result.violations.length === 0
        ? [{ kind: "ok", message: `${saved} אין חריגות היום ✔` }]
        : [{ kind: "ok", message: saved },
           ...result.violations.map((v) => ({ kind: "alert" as const, message: v.message }))]);
      setQuestionnaireCollapsed(true);
      queryClient.invalidateQueries({ queryKey: ["days"] });
    },
    onError: errorAlert("שמירת היום נכשלה"),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteDay,
    onSuccess: (result) => {
      setAlerts([{ kind: "ok", message: `הרשומה של ${result.date} נמחקה` }]);
      queryClient.invalidateQueries({ queryKey: ["days"] });
    },
    onError: errorAlert("מחיקת הרשומה נכשלה"),
  });

  const mealMutation = useMutation({
    mutationFn: api.addMeal,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["days"] }),
    onError: errorAlert("הוספת הארוחה נכשלה"),
  });

  const updateMealMutation = useMutation({
    mutationFn: ({ id, meal }: { id: string; meal: NewMeal }) => api.updateMeal(todayStr, id, meal),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["days"] }),
    onError: errorAlert("עדכון הארוחה נכשל"),
  });

  const deleteMealMutation = useMutation({
    mutationFn: (id: string) => api.deleteMeal(todayStr, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["days"] }),
    onError: errorAlert("מחיקת הארוחה נכשלה"),
  });

  if (questionnaireQuery.isPending || historyQuery.isPending) {
    return <main>טוען…</main>;
  }
  if (questionnaireQuery.isError || historyQuery.isError) {
    const error = (questionnaireQuery.error ?? historyQuery.error)!;
    return <main><div className="alert">{alertMessage("טעינת הנתונים נכשלה", error)}</div></main>;
  }

  const questionnaire = questionnaireQuery.data;
  const data = historyQuery.data;
  const answersByDate = new Map(data.days.map((d) => [d.date, d.answers]));
  const todaySubmitted = answersByDate.has(todayStr);
  const selectedDate = day === "yesterday" ? yesterdayStr : todayStr;

  const floors = day === "yesterday" ? data.yesterday.derived : data.today.derived;
  const questionnaireOpen = questionnaireCollapsed === null
    ? expandQuestionnaire(now, reminderHour, data.today.meals.length, todaySubmitted)
    : !questionnaireCollapsed;

  const submit = (answers: Record<string, AnswerValue>) =>
    submitMutation.mutate({ answers, date: selectedDate });

  return (
    <>
      <Header email={email} onSignOut={onSignOut}
              activeViolations={activeViolations(questionnaire, data.days, todayStr, yesterdayStr)} />
      <main>
        <Alerts items={alerts} onDismiss={dismissAlerts} />
        {!todaySubmitted && (
          <DayTracker
            questionnaire={questionnaire}
            today={data.today}
            firstMealHour={firstMealHour}
            onAddMeal={(meal) => mealMutation.mutate(meal)}
            onUpdateMeal={(id, meal) => updateMealMutation.mutate({ id, meal })}
            onDeleteMeal={(id) => deleteMealMutation.mutate(id)}
            onCloseDay={(answers) => submitMutation.mutate({ answers, date: todayStr })}
          />
        )}
        <CollapsibleSection title="שאלון סיכום יום" collapsed={!questionnaireOpen}
                            onToggle={() => setQuestionnaireCollapsed(questionnaireOpen)}>
          <DayPicker todayStr={todayStr} yesterdayStr={yesterdayStr} value={day}
                     todaySelectable={todaySelectable} reminderHour={reminderHour} onChange={setDay} />
          {/* Re-keyed per day so switching between today and yesterday reseeds the form from the
              newly selected day's saved answers. */}
          <QuestionnaireForm
            key={day}
            questionnaire={questionnaire}
            floors={floors}
            stored={answersByDate.get(selectedDate)}
            onSubmit={submit}
            onValidationError={(message) => setAlerts([{ kind: "alert", message }])}
          />
        </CollapsibleSection>
        <CollapsibleSection title="היסטוריה" className="history">
          {data.days.length > 0 && (
            <TrendChart questionnaire={questionnaire} days={data.days} today={data.today} endDate={data.days[0].date} />
          )}
          {viewedDate !== null && (
            viewedDayQuery.isPending ? <p>טוען…</p>
            : viewedDayQuery.isError ? <div className="alert">{alertMessage("טעינת היום נכשלה", viewedDayQuery.error)}</div>
            : <DayView questionnaire={questionnaire} day={viewedDayQuery.data}
                       onClose={() => setViewedDate(null)} />
          )}
          <HistoryTable
            questionnaire={questionnaire}
            days={data.days}
            today={todayStr}
            deletableDates={new Set([todayStr, yesterdayStr])}
            viewedDate={viewedDate}
            onDelete={(date) => deleteMutation.mutate(date)}
            onView={setViewedDate}
          />
        </CollapsibleSection>
      </main>
    </>
  );
}
