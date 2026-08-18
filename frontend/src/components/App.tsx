import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Api } from "../api";
import type { AnswerValue, Questionnaire } from "../types";
import { defaultDay, isoDate, yesterdayOf } from "../dates";
import { Alerts, type AlertItem } from "./Alerts";
import { DayPicker, type DayChoice } from "./DayPicker";
import { Header } from "./Header";
import { HistoryTable } from "./HistoryTable";
import { QuestionnaireForm } from "./QuestionnaireForm";
import { TrendChart } from "./TrendChart";

// Top-level screen: owns the server data (questionnaire config, answer history, submissions)
// and the submit → alerts → trend flow; the components below it are presentational.
export function App({ email, api }: { email: string; api: Api }) {
  const queryClient = useQueryClient();
  const [now] = useState(() => new Date());
  const todayStr = isoDate(now);
  const yesterdayStr = isoDate(yesterdayOf(now));

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  // The trend appears only after a submission, anchored to the submitted date.
  const [trendDate, setTrendDate] = useState<string | null>(null);
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
  const historyQuery = useQuery({ queryKey: ["history"], queryFn: api.getHistory });

  const historyDays = historyQuery.data?.days;
  useEffect(() => {
    if (day === null && historyDays) {
      setDay(defaultDay(now, new Set(historyDays.map((d) => d.date))));
    }
  }, [day, historyDays, now]);

  const submitMutation = useMutation({
    mutationFn: api.submitAnswers,
    onSuccess: (result) => {
      setAlerts(result.violations.length
        ? result.violations.map((v) => ({ kind: "alert" as const, message: v.message }))
        : [{ kind: "ok", message: `נשמר לתאריך ${result.date}! אין חריגות היום ✔` }]);
      setTrendDate(result.date);
      queryClient.invalidateQueries({ queryKey: ["history"] });
    },
    onError: (error) => setAlerts([{ kind: "alert", message: String(error) }]),
  });

  if (questionnaireQuery.isPending || historyQuery.isPending) {
    return <main>טוען…</main>;
  }
  if (questionnaireQuery.isError || historyQuery.isError) {
    const error = questionnaireQuery.error ?? historyQuery.error;
    return <main><div className="alert">{String(error)}</div></main>;
  }

  const questionnaire = questionnaireQuery.data;
  const days = historyQuery.data.days;

  const submit = (answers: Record<string, AnswerValue>) =>
    submitMutation.mutate({ answers, date: day === "yesterday" ? yesterdayStr : todayStr });

  return (
    <>
      <Header email={email} />
      <main>
        <Alerts items={alerts} />
        {trendDate && <TrendChart questionnaire={questionnaire} days={days} endDate={trendDate} />}
        <DayPicker todayStr={todayStr} yesterdayStr={yesterdayStr} value={day ?? "today"} onChange={setDay} />
        <QuestionnaireForm
          questionnaire={questionnaire}
          onSubmit={submit}
          onValidationError={(message) => setAlerts([{ kind: "alert", message }])}
        />
        <section>
          <h2>היסטוריה</h2>
          <div className="table-wrap">
            <HistoryTable questionnaire={questionnaire} days={days} />
          </div>
        </section>
      </main>
    </>
  );
}
