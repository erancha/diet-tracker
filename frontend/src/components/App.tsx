import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { alertMessage, type Api } from "../api";
import type { AnswerValue, Derived, Questionnaire } from "../types";
import { defaultDay, expandQuestionnaire, isoDate, yesterdayOf } from "../dates";
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
// and deletion, day submission with tracked floors, day deletion — plus the submit → alerts
// flow; the components below it are presentational.
export function App({ email, api, reminderHour, trackerStartHour, onSignOut }: {
  email: string; api: Api; reminderHour: number; trackerStartHour: number; onSignOut: () => void;
}) {
  const queryClient = useQueryClient();
  const [now] = useState(() => new Date());
  const todayStr = isoDate(now);
  const yesterdayStr = isoDate(yesterdayOf(now));

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  // null until history arrives, when the after-midnight smart default can be computed.
  const [day, setDay] = useState<DayChoice | null>(null);

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

  const historyDays = historyQuery.data?.days;
  useEffect(() => {
    if (day === null && historyDays) {
      setDay(defaultDay(now, new Set(historyDays.map((d) => d.date))));
    }
  }, [day, historyDays, now]);

  const errorAlert = (action: string) => (error: Error) =>
    setAlerts([{ kind: "alert", message: alertMessage(action, error) }]);

  const submitMutation = useMutation({
    mutationFn: api.submitDay,
    onSuccess: (result) => {
      setAlerts(result.violations.length
        ? result.violations.map((v) => ({ kind: "alert" as const, message: v.message }))
        : [{ kind: "ok", message: `נשמר לתאריך ${result.date}! אין חריגות היום ✔` }]);
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
  const todaySubmitted = data.days.some((d) => d.date === todayStr);

  const zeroFloors: Derived = { carbs: 0, meals: 0, vegetables: 0, eating_window: 0 };
  const floors = day === "yesterday" ? (data.yesterday?.derived ?? zeroFloors) : data.today.derived;

  const submit = (answers: Record<string, AnswerValue>) =>
    submitMutation.mutate({ answers, date: day === "yesterday" ? yesterdayStr : todayStr });

  return (
    <>
      <Header email={email} onSignOut={onSignOut} />
      <main>
        <Alerts items={alerts} />
        {!todaySubmitted && (
          <DayTracker
            questionnaire={questionnaire}
            trackerStartHour={trackerStartHour}
            today={data.today}
            onAddMeal={(meal) => mealMutation.mutate(meal)}
            onDeleteMeal={(id) => deleteMealMutation.mutate(id)}
            onCloseDay={(answers) => submitMutation.mutate({ answers, date: todayStr })}
          />
        )}
        <CollapsibleSection title="שאלון סוף יום"
                            defaultCollapsed={!expandQuestionnaire(now, reminderHour, data.today.meals.length, todaySubmitted)}>
          <DayPicker todayStr={todayStr} yesterdayStr={yesterdayStr} value={day ?? "today"} onChange={setDay} />
          <QuestionnaireForm
            key={day ?? "today"}
            questionnaire={questionnaire}
            floors={floors}
            onSubmit={submit}
            onValidationError={(message) => setAlerts([{ kind: "alert", message }])}
          />
        </CollapsibleSection>
        <CollapsibleSection title="היסטוריה" className="history">
          {data.days.length > 0 && (
            <TrendChart questionnaire={questionnaire} days={data.days} endDate={data.days[0].date} />
          )}
          {viewedDate !== null && (
            viewedDayQuery.isPending ? <p>טוען…</p>
            : viewedDayQuery.isError ? <div className="alert">{alertMessage("טעינת היום נכשלה", viewedDayQuery.error)}</div>
            : <DayView questionnaire={questionnaire} day={viewedDayQuery.data}
                       onClose={() => setViewedDate(null)} />
          )}
          <div className="table-wrap">
            <HistoryTable
              questionnaire={questionnaire}
              days={data.days}
              deletableDates={new Set([todayStr, yesterdayStr])}
              onDelete={(date) => deleteMutation.mutate(date)}
              onView={setViewedDate}
            />
          </div>
        </CollapsibleSection>
      </main>
    </>
  );
}
