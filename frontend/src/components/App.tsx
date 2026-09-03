import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { alertMessage, type Api } from "../api";
import { activeViolations, crossesThreshold } from "../violations";
import type { AnswerValue, AppConfigFile, NewMeal, WeightPayload } from "../types";
import { dayEnded, defaultDay, expandQuestionnaire, expandWeightSection, isoDate, yesterdayOf } from "../dates";
import { mayDiscardEdits } from "../edits";
import { TARGET_UNSET_NOTICE } from "../weight";
import { isFirstVisit } from "../firstVisit";
import { AdminSection } from "./AdminSection";
import { Alerts, type AlertItem } from "./Alerts";
import { Chat } from "./Chat";
import { CollapsibleSection } from "./CollapsibleSection";
import { DayPicker, type DayChoice } from "./DayPicker";
import { DayTracker } from "./DayTracker";
import { DayView } from "./DayView";
import { Header } from "./Header";
import { HistoryTable } from "./HistoryTable";
import { QuestionnaireForm } from "./QuestionnaireForm";
import { TrendChart } from "./TrendChart";
import { useWindDownFold } from "./useWindDownFold";
import { WeightSection } from "./WeightSection";
import { Welcome } from "./Welcome";

// Top-level screen: owns the server data (app config, day history, today's and yesterday's meal
// payloads, on-demand past-day payloads, the weight log) and every mutation — meal recording and
// deletion, day submission with tracked floors, day deletion, weight recording, retargeting and
// deletion, and the account's reminder opt-out — plus the submit → alerts flow,
// the day-end section's fold it closes, the empty history panel's timed wind-down fold, and the
// guard that keeps the day-end fold and the day picker from throwing away answers the day-end
// form has not submitted; apart from the chat and admin sections, which own their reads, the
// components below it hold no server state of their own.
//
// It also reads whether the account has recorded anything yet, because both the greeting and the
// weight section's opening fold answer to that one reading and must not disagree about it.
export function App({ email, api, dayEndHour, firstMealHour, mealGapHours, isAdmin, onSignOut }: {
  email: string; api: Api; dayEndHour: number; firstMealHour: number; mealGapHours: number;
  isAdmin: boolean; onSignOut: () => void;
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
  // Whether the day-end form holds answers it has not submitted. The form is unmounted by the
  // fold and reseeded by the day switch, both owned here, so its edits survive neither — this is
  // what lets the two ask before spending them.
  const [pendingAnswers, setPendingAnswers] = useState(false);
  const todaySelectable = dayEnded(now, dayEndHour);
  const [day, setDay] = useState<DayChoice>(() => defaultDay(now, dayEndHour));

  const configQuery = useQuery({
    queryKey: ["app-config"],
    queryFn: async (): Promise<AppConfigFile> => {
      const response = await fetch("app.json");
      if (!response.ok) throw new Error(`app.json → ${response.status}`);
      return response.json();
    },
    staleTime: Infinity,
  });
  const historyQuery = useQuery({ queryKey: ["days"], queryFn: api.getDays });
  const weightQuery = useQuery({ queryKey: ["weight"], queryFn: api.getWeight });

  // The history section's fold. On an account with nothing recorded the panel is empty axes, so
  // after a short look it winds down to its title line; the first recorded day or meal disarms
  // the countdown.
  const emptyHistory = historyQuery.data !== undefined
    && historyQuery.data.days.length === 0 && historyQuery.data.today.meals.length === 0;
  const historyFold = useWindDownFold(emptyHistory, false);

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
    onSuccess: (result, { answers }) => {
      // A violated day is still a saved day, so the confirmation leads either way — the folded
      // form would otherwise be the only sign the answers went through.
      const saved = `נשמר לתאריך ${result.date}!`;
      // A bound crossed today is painted red in the table beside the banner, so a clean-day claim
      // there reads as a contradiction; the banner names the crossing instead, as a notice — a
      // crossing is not yet the consecutive-days violation the alert rules watch for.
      setAlerts(result.violations.length > 0
        ? [{ kind: "ok", message: saved },
           ...result.violations.map((v) => ({ kind: "alert" as const, message: v.message }))]
        : crossesThreshold(configQuery.data!.questionnaire, answers)
          ? [{ kind: "ok", message: saved },
             { kind: "notice", message: "היום חצה סף (מסומן באדום בטבלה) — עדיין אין חריגה של ימים רצופים" }]
          : [{ kind: "ok", message: `${saved} אין חריגות היום ✔` }]);
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

  // Every weight mutation replies with the whole weight payload, so the cache takes the reply
  // rather than refetching what the server just handed back.
  const onWeightSuccess = (payload: WeightPayload) => queryClient.setQueryData(["weight"], payload);

  const recordWeightMutation = useMutation({
    mutationFn: api.recordWeight,
    onSuccess: (payload) => {
      onWeightSuccess(payload);
      if (payload.target === null) setAlerts([{ kind: "notice", message: TARGET_UNSET_NOTICE }]);
    },
    onError: errorAlert("שמירת המשקל נכשלה"),
  });

  const setTargetMutation = useMutation({
    mutationFn: api.setWeightTarget,
    onSuccess: onWeightSuccess,
    onError: errorAlert("עדכון משקל היעד נכשל"),
  });

  const deleteWeightMutation = useMutation({
    mutationFn: api.deleteWeight,
    onSuccess: onWeightSuccess,
    onError: errorAlert("מחיקת השקילה נכשלה"),
  });

  const setMutedMutation = useMutation({
    mutationFn: api.setMuted,
    onSuccess: ({ muted }) => {
      setAlerts([{ kind: "ok", message: muted
        ? "ביטלת את ההתראות — לא יישלחו אליך עוד תזכורות במייל או בטלגרם"
        : "ההתראות חזרו לפעול" }]);
      queryClient.invalidateQueries({ queryKey: ["days"] });
    },
    onError: errorAlert("עדכון ההתראות נכשל"),
  });

  if (configQuery.isPending || historyQuery.isPending || weightQuery.isPending) {
    return <main>טוען…</main>;
  }
  if (configQuery.isError || historyQuery.isError || weightQuery.isError) {
    const error = (configQuery.error ?? historyQuery.error ?? weightQuery.error)!;
    return <main><div className="alert">{alertMessage("טעינת הנתונים נכשלה", error)}</div></main>;
  }

  const questionnaire = configQuery.data.questionnaire;
  const data = historyQuery.data;
  const firstVisit = isFirstVisit(data, weightQuery.data);
  // The weight section rests folded, and opens for the two occasions it is the reason the page
  // was loaded: a first visit, and the weigh-in morning while no recent weighing answers it.
  const openWeight = firstVisit
    || expandWeightSection(now, configQuery.data.weight.weigh_in.weekday, weightQuery.data.entries);
  const answersByDate = new Map(data.days.map((d) => [d.date, d.answers]));
  const todaySubmitted = answersByDate.has(todayStr);
  const selectedDate = day === "yesterday" ? yesterdayStr : todayStr;

  const floors = day === "yesterday" ? data.yesterday.derived : data.today.derived;
  const questionnaireOpen = questionnaireCollapsed === null
    ? expandQuestionnaire(now, dayEndHour, data.today.meals.length, todaySubmitted)
    : !questionnaireCollapsed;

  const submit = (answers: Record<string, AnswerValue>) =>
    submitMutation.mutate({ answers, date: selectedDate });

  // Folded, the day-end section is one title line, so it rides in the tracker's header row instead
  // of costing a row of its own; open, it needs the page width and returns to its own row below.
  // Its heading level follows that move, keeping the document outline ordered either way.
  const daySummaryFoldedIntoTracker = !todaySubmitted && !questionnaireOpen;
  const toggleDaySummary = () => {
    if (mayDiscardEdits(pendingAnswers)) setQuestionnaireCollapsed(questionnaireOpen);
  };
  // Before the day-end hour the section answers for yesterday alone, so its heading waits in grey
  // until the day it is named for can be answered.
  const daySummarySection = (
    <CollapsibleSection title="שאלון סיכום היום" collapsed={!questionnaireOpen}
                        className={todaySelectable ? undefined : "day-not-ended"}
                        headingLevel={daySummaryFoldedIntoTracker ? 3 : 2}
                        onToggle={toggleDaySummary}>
      <DayPicker todayStr={todayStr} yesterdayStr={yesterdayStr} value={day}
                 todaySelectable={todaySelectable} dayEndHour={dayEndHour}
                 onChange={(next) => { if (mayDiscardEdits(pendingAnswers)) setDay(next); }} />
      {/* Re-keyed per day so switching between today and yesterday reseeds the form from the
          newly selected day's saved answers. */}
      <QuestionnaireForm
        key={day}
        questionnaire={questionnaire}
        floors={floors}
        stored={answersByDate.get(selectedDate)}
        onSubmit={submit}
        onValidationError={(message) => setAlerts([{ kind: "alert", message }])}
        onPendingChange={setPendingAnswers}
      />
    </CollapsibleSection>
  );

  return (
    <>
      <Header email={email} onSignOut={onSignOut} muted={data.muted}
              onSetMuted={(muted) => setMutedMutation.mutate(muted)}
              activeViolations={activeViolations(questionnaire, data.days, todayStr, yesterdayStr)} />
      <main>
        <Alerts items={alerts} onDismiss={dismissAlerts} />
        {firstVisit && <Welcome />}
        <WeightSection
          weight={weightQuery.data}
          settings={configQuery.data.weight}
          now={now}
          defaultExpanded={openWeight}
          onRecord={(kg) => recordWeightMutation.mutate(kg)}
          onSetTarget={(kg) => setTargetMutation.mutate(kg)}
          onDelete={(date) => deleteWeightMutation.mutate(date)}
        />
        {!todaySubmitted && (
          <DayTracker
            questionnaire={questionnaire}
            today={data.today}
            firstMealHour={firstMealHour}
            mealGapHours={mealGapHours}
            maxMealsPerDay={configQuery.data.meals.max_per_day}
            onAddMeal={(meal) => mealMutation.mutate(meal)}
            onUpdateMeal={(id, meal) => updateMealMutation.mutate({ id, meal })}
            onDeleteMeal={(id) => deleteMealMutation.mutate(id)}
            // Pending covers the days refetch too — onSuccess returns the invalidation promise —
            // so the row's delete control stays locked until the row itself leaves the list.
            deletingMealId={deleteMealMutation.isPending ? deleteMealMutation.variables : undefined}
            // Same refetch coverage: the close-day confirm waits until a saved meal is back in
            // today's list, so the figures it submits count that meal.
            savingMeal={mealMutation.isPending || updateMealMutation.isPending}
            onCloseDay={(answers) => submitMutation.mutate({ answers, date: todayStr })}
            headerAside={daySummaryFoldedIntoTracker ? daySummarySection : undefined}
          />
        )}
        {!daySummaryFoldedIntoTracker && daySummarySection}
        <CollapsibleSection title="היסטוריה" collapsed={historyFold.collapsed}
                            onToggle={historyFold.toggle}
                            className={historyFold.waning ? "history section-waning" : "history"}>
          <div className={historyFold.folding ? "section-fold-body section-folding" : "section-fold-body"}>
          <div>
          <TrendChart questionnaire={questionnaire} days={data.days} today={data.today}
                      endDate={data.days.length > 0 ? data.days[0].date : data.today.date} />
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
          </div>
          </div>
        </CollapsibleSection>
        <CollapsibleSection className="chat-section" title="שאלות על אבא חטוב">
          <Chat api={api} sampleQuestions={configQuery.data.chat.sample_questions} />
        </CollapsibleSection>
        {isAdmin && <AdminSection api={api} />}
      </main>
    </>
  );
}
