import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { alertMessage, type Api } from "../api";
import { activeViolations, crossesThreshold } from "../violations";
import type { AppConfigFile, NewMeal, WeightPayload } from "../types";
import { beforeDailyCutoff, expandWeightSection, isoDate, yesterdayOf } from "../dates";
import { TARGET_UNSET_NOTICE } from "../weight";
import { isFirstVisit } from "../firstVisit";
import { storeCondensedView, storedCondensedView } from "../viewMode";
import { AdminSection } from "./AdminSection";
import { Alerts, type AlertItem } from "./Alerts";
import { Chat } from "./Chat";
import { CollapsibleSection } from "./CollapsibleSection";
import { DayTracker } from "./DayTracker";
import { DayView } from "./DayView";
import { Header } from "./Header";
import { HistoryTable } from "./HistoryTable";
import { TrendChart } from "./TrendChart";
import { advanceFoldAll, FoldAllContext, useFoldAllEffect, type FoldAllCommand } from "./useFoldAll";
import { useWindDownFold } from "./useWindDownFold";
import { WeightSection } from "./WeightSection";
import { Welcome } from "./Welcome";

// Top-level screen: owns the server data (app config, day history, the tracked day's and
// yesterday's meal payloads, on-demand past-day payloads, the weight log) and every mutation —
// meal recording and deletion, the day's closing through the tracker, day deletion, weight
// recording, retargeting and deletion, and the account's reminder opt-out — plus the close →
// alerts flow, the menu's condensed/full view command with its browser-remembered choice, and
// the empty history panel's timed wind-down fold; apart from the chat and admin sections, which
// own their reads, the components below it hold no server state of their own.
//
// The tracker is the only way a day closes, and the day it targets is decided here: today,
// except during the small-hours grace window while yesterday's meals still leave something to
// act on — closing a day whose record is missing, or reopening one whose record is still
// deletable. The tracker never leaves the screen: a closed day shows read-only behind a single
// reopen gate. The grace bounds come from app.json, the same file the API reads, so both ends
// enforce one window.
//
// The admin account is not a dieter: its screen keeps the chat and the per-user activity panel
// and drops the tracking sections a regular account opens on.
//
// It also reads whether the account has recorded anything yet, because both the greeting and the
// weight section's opening fold answer to that one reading and must not disagree about it.
export function App({ email, api, firstMealHour, mealGapHours, isAdmin, onSignOut }: {
  email: string; api: Api; firstMealHour: number; mealGapHours: number;
  isAdmin: boolean; onSignOut: () => void;
}) {
  const queryClient = useQueryClient();
  const [now] = useState(() => new Date());
  const todayStr = isoDate(now);
  const yesterdayStr = isoDate(yesterdayOf(now));

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  // Stable so the alert strip's dismissal timer is not restarted by every re-render of this screen.
  const dismissAlerts = useCallback(() => setAlerts([]), []);

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

  // The view the account signed off with last time, seeding every state the view command
  // governs. Read once at mount: from here on the command itself carries the current view.
  const [openedCondensed] = useState(storedCondensedView);

  // The trends section's fold. On an account with nothing recorded the panel is empty axes, so
  // after a short look it winds down to its title line; the first recorded day or meal disarms
  // the countdown.
  const emptyTrends = historyQuery.data !== undefined
    && historyQuery.data.days.length === 0 && historyQuery.data.today.meals.length === 0;
  const trendsFold = useWindDownFold(emptyTrends, openedCondensed);

  // The menu's condensed/full view command, broadcast through FoldAllContext to the sections
  // that hold their own collapsed state; the trends fold, held right here above the provider,
  // takes it directly. The day tracker and the chat section stand outside the command — the
  // tracker is the page's working surface and the chat keeps its composer on screen, folding
  // only its previous turns — so both keep their own hand-toggled folds.
  const [foldAll, setFoldAll] = useState<FoldAllCommand>({ gen: 0, collapsed: openedCondensed });
  const [chatCollapsed, setChatCollapsed] = useState(false);
  useFoldAllEffect(foldAll, trendsFold.set);

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
      // A violated day is still a saved day, so the confirmation leads either way — the closed
      // tracker would otherwise be the only sign the figures went through.
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
      queryClient.invalidateQueries({ queryKey: ["days"] });
    },
    onError: errorAlert("שמירת היום נכשלה"),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteDay,
    onSuccess: (result) => {
      setAlerts([{ kind: "ok", message: `הרשומה של ${result.date} נמחקה` }]);
      // The deleted day's open read-only view would outlive its history row; any other open day
      // is untouched — the tracker's reopen also deletes through here.
      setViewedDate((viewed) => (viewed === result.date ? null : viewed));
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
    mutationFn: ({ date, id, meal }: { date: string; id: string; meal: NewMeal }) =>
      api.updateMeal(date, id, meal),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["days"] }),
    onError: errorAlert("עדכון הארוחה נכשל"),
  });

  const deleteMealMutation = useMutation({
    mutationFn: ({ date, id }: { date: string; id: string }) => api.deleteMeal(date, id),
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
  const dayClose = configQuery.data.day_close;
  const data = historyQuery.data;
  const firstVisit = isFirstVisit(data, weightQuery.data);
  // The weight section rests folded, and opens for the two occasions it is the reason the page
  // was loaded: a first visit, and the weigh-in morning while no recent weighing answers it.
  const openWeight = firstVisit
    || expandWeightSection(now, configQuery.data.weight.weigh_in.weekday, weightQuery.data.entries);
  const answersByDate = new Map(data.days.map((d) => [d.date, d.answers]));
  const trendEndDate = data.days.length > 0 ? data.days[0].date : data.today.date;

  // Yesterday's record leaves the deletable set before it leaves the closable one, so a deletion
  // can never outlive the chance to re-close what it removed.
  const beforeDeleteBound = beforeDailyCutoff(now, dayClose.delete_until);
  const deletableDates = new Set(beforeDeleteBound ? [todayStr, yesterdayStr] : [todayStr]);

  // The day the tracker stands on. Yesterday holds it only while its meals still leave something
  // to act on there: closing while its record is missing and the close bound holds, or reopening
  // while its record exists and is still deletable. Past both bounds the tracker is today's.
  const targetsYesterday = data.yesterday.meals.length > 0
    && (answersByDate.has(yesterdayStr)
      ? beforeDeleteBound
      : beforeDailyCutoff(now, dayClose.close_until));
  const activeDay = targetsYesterday ? data.yesterday : data.today;
  const activeDaySubmitted = answersByDate.has(activeDay.date);

  return (
    <>
      <Header email={email} onSignOut={onSignOut} muted={data.muted}
              onSetMuted={(muted) => setMutedMutation.mutate(muted)}
              onFoldAll={() => {
                // The chosen view is what the press switches to — the reading the next sign-in
                // opens on.
                storeCondensedView(!foldAll.collapsed);
                setFoldAll(advanceFoldAll);
              }}
              // The item names the view a press will switch to, read off the last command rather
              // than the sections' scattered states — hand-toggling sections does not rename it.
              nextViewCondensed={!foldAll.collapsed}
              activeViolations={activeViolations(questionnaire, data.days, todayStr, yesterdayStr)} />
      <main>
      <FoldAllContext.Provider value={foldAll}>
        <Alerts items={alerts} onDismiss={dismissAlerts} />
        {!isAdmin && <>
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
        <DayTracker
            questionnaire={questionnaire}
            day={activeDay}
            isToday={!targetsYesterday}
            closed={activeDaySubmitted}
            // Reopening deletes the closed record over the same mutation and windows the history
            // table's delete control uses; the meals survive, so the day is simply open again.
            onReopenDay={() => deleteMutation.mutate(activeDay.date)}
            firstMealHour={firstMealHour}
            mealGapHours={mealGapHours}
            maxMealsPerDay={configQuery.data.meals.max_per_day}
            closeMinWindowHours={dayClose.min_window_hours}
            onAddMeal={(meal) => mealMutation.mutate(meal)}
            onUpdateMeal={(id, meal) => updateMealMutation.mutate({ date: activeDay.date, id, meal })}
            onDeleteMeal={(id) => deleteMealMutation.mutate({ date: activeDay.date, id })}
            // Pending covers the days refetch too — onSuccess returns the invalidation promise —
            // so the row's delete control stays locked until the row itself leaves the list.
            deletingMealId={deleteMealMutation.isPending ? deleteMealMutation.variables.id : undefined}
            // Same refetch coverage: the close-day confirm waits until a saved meal is back in
            // the day's list, so the figures it submits count that meal.
            savingMeal={mealMutation.isPending || updateMealMutation.isPending}
            onCloseDay={(answers) => submitMutation.mutate({ answers, date: activeDay.date })}
        />
        <CollapsibleSection title="מגמות" collapsed={trendsFold.collapsed}
                            onToggle={trendsFold.toggle}
                            // While folded, a summary line names what the fold holds and opens
                            // it, and the headline trend panel stays on screen below it; open,
                            // the graphs speak for themselves and both withdraw.
                            summary={trendsFold.collapsed && (
                              <>
                                <button type="button" className="quiet section-summary"
                                        onClick={trendsFold.toggle}>
                                  גרפי מגמה 📈 ונתוני הימים האחרונים 📋
                                </button>
                                <TrendChart questionnaire={questionnaire} days={data.days}
                                            today={data.today} headlineOnly endDate={trendEndDate} />
                              </>
                            )}
                            className={trendsFold.waning ? "trends section-waning" : "trends"}>
          <div className={trendsFold.folding ? "section-fold-body section-folding" : "section-fold-body"}>
          <div>
          <TrendChart questionnaire={questionnaire} days={data.days} today={data.today}
                      endDate={trendEndDate} />
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
            deletableDates={deletableDates}
            viewedDate={viewedDate}
            onDelete={(date) => deleteMutation.mutate(date)}
            onView={setViewedDate}
          />
          </div>
          </div>
        </CollapsibleSection>
        </>}
        <CollapsibleSection className="chat-section" title="שאלות על אבא חטוב"
                            collapsed={chatCollapsed}
                            onToggle={() => setChatCollapsed((c) => !c)}>
          <Chat api={api} sampleQuestions={configQuery.data.chat.sample_questions}
                defaultTranscriptFolded={openedCondensed} />
        </CollapsibleSection>
        {isAdmin && <AdminSection api={api} />}
      </FoldAllContext.Provider>
      </main>
    </>
  );
}
