import { claims, ensureSignedIn } from "./auth.js";

const cfg = window.CONFIG;
const tokens = await ensureSignedIn(cfg);
document.getElementById("user-email").textContent = claims(tokens.id_token).email;

// Local calendar day, e.g. "2026-08-18" — matches the API's YYYY-MM-DD sort key format.
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseIsoDate = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const dayLabel = (s) => {
  const [, m, d] = s.split("-");
  return `${Number(d)}.${Number(m)}`;
};
const now = new Date();
const todayStr = isoDate(now);
const yesterdayStr = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

renderDayPicker();
const questionnaire = await (await fetch("questionnaire.json")).json();
renderForm(questionnaire);

// Chartable = every choice carries a numeric "value" (config-driven unit mapping, e.g. liters,
// hours) — questions without a full numeric mapping are surfaced only in the violations strip.
const chartableQuestions = questionnaire.questions.filter((q) => q.choices.every((c) => typeof c.value === "number"));
const otherQuestions = questionnaire.questions.filter((q) => !chartableQuestions.includes(q));
// Positional presentation copy for the trend panels — paired by chartable order, not by
// question id, so the config stays the only place question identity is declared.
const PANEL_TITLES = ["שתיה (ליטרים)", "חלון אכילה (שעות)"];

const initialHistory = await loadHistory();
applySmartDefault(initialHistory.days);
document.getElementById("submit").addEventListener("click", submit);

function renderForm(q) {
  document.getElementById("questionnaire").innerHTML = q.questions.map((question) => `
    <fieldset>
      <legend>${question.text}</legend>
      ${question.choices.map((choice) => `
        <label><input type="${question.type === "multi" ? "checkbox" : "radio"}" name="${question.id}" value="${choice.id}" ${question.type === "multi" ? "" : "required"}> ${choice.label}</label>
      `).join("")}
    </fieldset>`).join("");
}

function renderDayPicker() {
  document.getElementById("day-picker").innerHTML = `
    <label><input type="radio" name="day" value="today" checked> היום (${todayStr})</label>
    <label><input type="radio" name="day" value="yesterday"> אתמול (${yesterdayStr})</label>
  `;
}

// Before 04:00, with neither today nor yesterday filled yet, the questionnaire being filled now
// is almost always for the day that just ended — default to yesterday so after-midnight users
// don't have to notice and switch the picker themselves.
function applySmartDefault(days) {
  const filled = new Set(days.map((day) => day.date));
  const afterMidnightGap = now.getHours() < 4 && !filled.has(yesterdayStr) && !filled.has(todayStr);
  const value = afterMidnightGap ? "yesterday" : "today";
  document.querySelector(`input[name="day"][value="${value}"]`).checked = true;
}

async function submit() {
  const form = document.getElementById("questionnaire");
  if (!form.reportValidity()) return;
  const formData = new FormData(form);
  const multiQuestions = questionnaire.questions.filter((q) => q.type === "multi");
  for (const question of multiQuestions) {
    if (formData.getAll(question.id).length === 0) {
      document.getElementById("alerts").innerHTML =
        `<div class="alert">יש לסמן לפחות אפשרות אחת בשאלת ${question.text}</div>`;
      return;
    }
  }
  const answers = Object.fromEntries(questionnaire.questions.map((q) =>
    [q.id, q.type === "multi" ? formData.getAll(q.id) : formData.get(q.id)]));
  const date = document.querySelector('input[name="day"]:checked').value === "yesterday" ? yesterdayStr : todayStr;
  const result = await api("POST", "/answers", { answers, date });
  showResult(result.date, result.violations);
  const history = await loadHistory();
  renderTrend(result.date, history.days);
}

function showResult(date, violations) {
  document.getElementById("alerts").innerHTML = violations.length
    ? violations.map((v) => `<div class="alert">${v.message}</div>`).join("")
    : `<div class="ok">נשמר לתאריך ${date}! אין חריגות היום ✔</div>`;
}

function selectedIds(value) {
  return Array.isArray(value) ? value : [value];
}

function choiceLabel(questionId, choiceId) {
  const question = questionnaire.questions.find((q) => q.id === questionId);
  // Historical answers may reference choices from older questionnaire versions.
  return question?.choices.find((c) => c.id === choiceId)?.label ?? choiceId;
}

function isViolating(questionId, value) {
  return questionnaire.rules.some((rule) =>
    rule.question_id === questionId && selectedIds(value).some((id) => rule.violating_choice_ids.includes(id)));
}

// Labels of just the violating choices selected for a question (there is at most one violating
// rule per question in the current config, but a multi-select question could match more than one).
function violatingChoiceLabels(questionId, value) {
  const violatingIds = questionnaire.rules
    .filter((rule) => rule.question_id === questionId)
    .flatMap((rule) => [...rule.violating_choice_ids]);
  return selectedIds(value)
    .filter((id) => violatingIds.includes(id))
    .map((id) => choiceLabel(questionId, id))
    .join(" · ");
}

async function loadHistory() {
  const data = await api("GET", "/answers");
  const cellText = (questionId, value) => selectedIds(value).map((id) => choiceLabel(questionId, id)).join(" · ");
  const header = `<tr><th>תאריך</th>${questionnaire.questions.map((q) => `<th>${q.text}</th>`).join("")}</tr>`;
  const rows = data.days.map((day) => `
    <tr><td>${day.date}</td>${questionnaire.questions.map((q) => q.id in day.answers
      ? `<td class="${isViolating(q.id, day.answers[q.id]) ? "violation" : ""}">${cellText(q.id, day.answers[q.id])}</td>`
      : `<td>—</td>`).join("")}
    </tr>`).join("");
  document.getElementById("history").innerHTML = header + rows;
  return data;
}

// --- 7-day trend chart -----------------------------------------------------------------

const TREND_WIDTH = 640;
// Wide enough for the longest y-tick label ("פחות מ-2.5") anchored at its right edge.
const TREND_MARGIN_LEFT = 78;
const TREND_MARGIN_RIGHT = 14;
const PANEL_H = 120;
const PANEL_GAP = 8;
const STRIP_GAP = 12;
const STRIP_H = 24;
const BOTTOM_PAD = 4;

function last7Days(endDateStr) {
  const end = parseIsoDate(endDateStr);
  return Array.from({ length: 7 }, (_, i) =>
    isoDate(new Date(end.getFullYear(), end.getMonth(), end.getDate() - (6 - i))));
}

function panelTop(index) {
  return index * (PANEL_H + PANEL_GAP);
}

// Short form for choice labels phrased as an open-ended bound ("מעל 12 שעות", "פחות מ-2.5 ליטר")
// so a y-axis tick landing on that choice reads the bound instead of the bare mapped number.
function shortForm(label) {
  const m = label.match(/^(מעל|פחות מ-?)\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return m[1].endsWith("-") ? `${m[1]}${m[2]}` : `${m[1]} ${m[2]}`;
}

function tickLabel(question, value) {
  const choice = question.choices.find((c) => c.value === value);
  return (choice && shortForm(choice.label)) || String(value);
}

// Two or three gridlines at the question's min, max, and nearest-to-midpoint choice values —
// picking real choice values (rather than the padded domain edges) is what lets shortForm above
// recognize and relabel the open-ended extremes.
function ticksFor(question) {
  const values = [...new Set(question.choices.map((c) => c.value))].sort((a, b) => a - b);
  const min = values[0];
  const max = values[values.length - 1];
  const midTarget = (min + max) / 2;
  const mid = values.reduce((closest, v) => Math.abs(v - midTarget) < Math.abs(closest - midTarget) ? v : closest, min);
  return [...new Set([min, mid, max])].map((value) => ({ value, label: tickLabel(question, value) }));
}

function buildLinePath(points) {
  let d = "";
  let connecting = false;
  for (const p of points) {
    if (!p) {
      connecting = false;
      continue;
    }
    d += `${connecting ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)} `;
    connecting = true;
  }
  return d.trim();
}

function escapeAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function renderPanel(question, index, dayStrs, dayByDate, x, isLast, title) {
  const top = panelTop(index);
  const titleY = top + 12;
  const plotTop = top + 22;
  const plotBottom = top + 100;
  const color = `var(--viz-series-${index + 1})`;
  const values = question.choices.map((c) => c.value);
  const domainMin = Math.min(...values) - 0.5;
  const domainMax = Math.max(...values) + 0.5;
  const yFor = (v) => plotTop + ((domainMax - v) / (domainMax - domainMin)) * (plotBottom - plotTop);

  const points = dayStrs.map((date) => {
    const day = dayByDate.get(date);
    const answerId = day && day.answers[question.id];
    if (answerId == null) return null;
    const choice = question.choices.find((c) => c.id === answerId);
    // Answers referencing choices from older questionnaire versions chart as a gap.
    if (!choice) return null;
    return { date, value: choice.value, label: choice.label, violating: isViolating(question.id, answerId) };
  });

  const linePath = buildLinePath(points.map((p, i) => p && { x: x(i), y: yFor(p.value) }));

  const gridlines = ticksFor(question).map(({ value, label }) => {
    const y = yFor(value).toFixed(2);
    return `
      <line x1="${x(0)}" y1="${y}" x2="${x(dayStrs.length - 1)}" y2="${y}" class="trend-grid" />
      <text x="${(x(0) - 6).toFixed(2)}" y="${(Number(y) + 3).toFixed(2)}" class="trend-ytick" text-anchor="end">${label}</text>`;
  }).join("");

  const baseline = `<line x1="${x(0)}" y1="${plotBottom}" x2="${x(dayStrs.length - 1)}" y2="${plotBottom}" class="trend-baseline" />`;

  const markers = points.map((p, i) => {
    if (!p) return "";
    const cx = x(i).toFixed(2);
    const cy = yFor(p.value).toFixed(2);
    const r = p.violating ? 4.5 : 4;
    const fill = p.violating ? "var(--viz-critical)" : color;
    const tooltip = escapeAttr(`${dayLabel(p.date)} · ${p.label}`);
    return `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />
      <circle cx="${cx}" cy="${cy}" r="10" class="hit" tabindex="0" data-tooltip="${tooltip}" />`;
  }).join("");

  const xLabels = isLast ? dayStrs.map((date, i) => `
      <text x="${x(i).toFixed(2)}" y="${top + 116}" class="trend-xtick" text-anchor="middle">${dayLabel(date)}</text>`).join("") : "";

  const chip = `<circle cx="8" cy="${titleY - 4}" r="4" fill="${color}" />`;
  const titleText = `<text x="18" y="${titleY}" class="trend-title" fill="currentColor">${title}</text>`;

  return `
    ${gridlines}
    ${baseline}
    ${chip}
    ${titleText}
    <path d="${linePath}" class="trend-line" style="stroke: ${color}" />
    ${markers}
    ${xLabels}`;
}

function renderViolationsStrip(dayStrs, dayByDate, top, x) {
  const tickY0 = top + (STRIP_H - 8) / 2;
  const tickY1 = tickY0 + 8;
  return dayStrs.flatMap((date, i) => {
    const day = dayByDate.get(date);
    if (!day) return [];
    const violations = otherQuestions.filter((q) => q.id in day.answers && isViolating(q.id, day.answers[q.id]));
    return violations.map((q, j) => {
      const dx = (j - (violations.length - 1) / 2) * 5;
      const cx = (x(i) + dx).toFixed(2);
      const label = violatingChoiceLabels(q.id, day.answers[q.id]);
      const tooltip = escapeAttr(`${dayLabel(date)} · ${q.text}: ${label}`);
      return `
        <line x1="${cx}" y1="${tickY0}" x2="${cx}" y2="${tickY1}" class="trend-violation-tick" />
        <circle cx="${cx}" cy="${((tickY0 + tickY1) / 2).toFixed(2)}" r="10" class="hit" tabindex="0" data-tooltip="${tooltip}" />`;
    });
  }).join("");
}

// Shows/hides the single shared tooltip div for every hoverable/focusable mark in the chart —
// mouseenter/focus and mouseleave/blur don't bubble, so delegation here relies on capture phase.
function attachTooltips(container) {
  const tooltip = document.getElementById("trend-tooltip");
  const show = (target) => {
    tooltip.textContent = target.getAttribute("data-tooltip");
    tooltip.hidden = false;
    const rect = target.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.top = `${rect.top - 8}px`;
  };
  const hide = () => { tooltip.hidden = true; };
  for (const type of ["mouseenter", "focus"]) {
    container.addEventListener(type, (e) => {
      const hit = e.target.closest && e.target.closest(".hit");
      if (hit) show(hit);
    }, true);
  }
  for (const type of ["mouseleave", "blur"]) {
    container.addEventListener(type, (e) => {
      const hit = e.target.closest && e.target.closest(".hit");
      if (hit) hide();
    }, true);
  }
}

function renderTrend(submittedDate, days) {
  const trendEl = document.getElementById("trend");
  if (chartableQuestions.length === 0) {
    trendEl.hidden = true;
    return;
  }
  const dayStrs = last7Days(submittedDate);
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  const plotWidth = TREND_WIDTH - TREND_MARGIN_LEFT - TREND_MARGIN_RIGHT;
  const xStep = plotWidth / (dayStrs.length - 1);
  const x = (i) => TREND_MARGIN_LEFT + i * xStep;

  const panels = chartableQuestions.map((question, index) =>
    renderPanel(question, index, dayStrs, dayByDate, x, index === chartableQuestions.length - 1, PANEL_TITLES[index] ?? question.text));

  const lastPanelBottom = panelTop(chartableQuestions.length - 1) + PANEL_H;
  const stripTop = lastPanelBottom + STRIP_GAP;
  const strip = renderViolationsStrip(dayStrs, dayByDate, stripTop, x);
  const height = stripTop + STRIP_H + BOTTOM_PAD;

  trendEl.innerHTML = `
    <svg viewBox="0 0 ${TREND_WIDTH} ${height}" width="${TREND_WIDTH}" height="${height}" class="trend-svg" role="img" aria-label="מגמת שבוע אחרון">
      ${panels.join("")}
      ${strip}
    </svg>
    <div class="trend-legend"><span class="trend-legend-dot"></span> חריגה</div>
  `;
  trendEl.hidden = false;
  if (!trendEl.dataset.tooltipBound) {
    attachTooltips(trendEl);
    trendEl.dataset.tooltipBound = "1";
  }
}

async function api(method, path, body) {
  const response = await fetch(cfg.apiUrl + path, {
    method,
    headers: {
      Authorization: `Bearer ${tokens.id_token}`,
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body && JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${await response.text()}`);
  return response.json();
}
