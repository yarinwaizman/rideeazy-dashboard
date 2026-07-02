import * as XLSX from "xlsx";

// The source workbook has one "<חודש> - שבועי" sheet per month, each containing
// several week-blocks: a date-range header row, a day-of-week header row, then
// metric rows (values per day + a total column). Category names drift slightly
// between months (e.g. "הצעות מחיר" vs "הצעות מחיר באתר"), so we normalize
// through an alias table rather than trusting exact string matches.

export const METRIC_LABELS = {
  "כניסות לאתר נחיתה": "כניסות לדף נחיתה",
  "כניסות לאתר הזמנות": "כניסות לאתר הזמנות",
  "הרשמות לאתר": "הרשמות",
  "הצעות מחיר": "הצעות מחיר",
  "תפוקת שירות לקוחות": "טיפולי שירות",
  "מכרזים נפתחו": "מכרזים נפתחו",
  "הזמנות ממכרזים": "הזמנות סגורות",
};

const METRIC_ALIASES = {
  "כניסות לאתר נחיתה": "כניסות לאתר נחיתה",
  "כניסות לאתר הזמנות": "כניסות לאתר הזמנות",
  "הרשמות לאתר": "הרשמות לאתר",
  "הצעות מחיר": "הצעות מחיר",
  "הצעות מחיר באתר": "הצעות מחיר",
  "הצעות מחיר שנתנו עי המערכת": "הצעות מחיר",
  "תפוקת שירות לקוחות - טיפול יומי": "תפוקת שירות לקוחות",
  "מכרזים נפתחו": "מכרזים נפתחו",
  "הזמנות ממכרזים": "הזמנות ממכרזים",
  "סגירות ממכרזים": "הזמנות ממכרזים",
};

const RATE_ALIASES = {
  "אחוז המרה לליד": "המרה לליד",
  "אחוז שנציג פתח להם מכרז מתוך רלוונטיים": "פתיחת מכרז",
  "אחוז מכירות": "מכירה",
};

export const MONTH_ORDER = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

function detectMonth(sheetName) {
  return MONTH_ORDER.find((m) => sheetName.includes(m)) || null;
}

function isWeekHeader(cell) {
  if (typeof cell !== "string") return false;
  const t = cell.trim();
  return /^\d/.test(t) && /[-–]/.test(t);
}

function toNumber(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || s === "-") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

// Columns 1-6 are the day-of-week values (Sun-Thu + combined weekend);
// column 7 is a pre-computed total that's sometimes left blank for weeks
// still in progress, so we sum the days ourselves instead of trusting it.
function sumDayValues(row) {
  let total = 0;
  for (let i = 1; i <= 6 && i < row.length; i++) {
    const n = toNumber(row[i]);
    if (n !== null) total += n;
  }
  return total;
}

function averagePercent(row) {
  const vals = [];
  for (let i = 1; i <= 6 && i < row.length; i++) {
    const cell = row[i];
    if (typeof cell === "string" && cell.trim().endsWith("%")) {
      const n = Number(cell.trim().replace("%", ""));
      if (!Number.isNaN(n)) vals.push(n);
    }
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length / 100;
}

function isAllZero(metrics) {
  return Object.values(metrics).every((v) => !v);
}

// Week labels are hand-typed and drift in format: "01-03.01.26",
// "26.04-02.05.26", "31.05-06..6.26", "14/6 - 19/6", "28\6 - 4\7",
// "05-11.07.2026". This normalizes separators so day/month/year can be
// pulled out of the (start, end) parts regardless of which style was used.
function normalizeWeekLabel(raw) {
  return raw
    .replace(/[/\\]/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/–/g, "-")
    .replace(/\s*-\s*/g, "-")
    .trim();
}

function parseDatePart(str) {
  const nums = str
    .split(".")
    .map((n) => parseInt(n, 10))
    .filter((n) => !Number.isNaN(n));
  if (nums.length === 0) return null;
  const [day, month, year] = nums;
  return { day, month, year };
}

function resolveYear(y) {
  if (y === undefined) return undefined;
  return y < 100 ? 2000 + y : y;
}

// Best-effort (start, end) Date range for a week label. Returns null if the
// format is unrecognizable, so callers can fail open rather than drop data.
function parseWeekRange(label) {
  const parts = normalizeWeekLabel(label).split("-");
  if (parts.length !== 2) return null;
  const end = parseDatePart(parts[1]);
  const start = parseDatePart(parts[0]);
  if (!end || !start || !end.month || !end.day) return null;

  const endYear = resolveYear(end.year) ?? new Date().getFullYear();
  const startMonth = start.month ?? end.month;
  const startYear = resolveYear(start.year) ?? endYear;

  const startDate = new Date(startYear, startMonth - 1, start.day);
  const endDate = new Date(endYear, end.month - 1, end.day, 23, 59, 59);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return { start: startDate, end: endDate };
}

export function parseWorkbook(workbook) {
  const weeks = [];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.includes("חודשי")) continue; // monthly rollup sheets are redundant with the weekly ones
    const month = detectMonth(sheetName);
    if (!month) continue;

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: false,
    });

    let current = null;
    for (const row of rows) {
      if (!row || row.length === 0) continue;
      const label = row[0];

      if (isWeekHeader(label)) {
        if (current) weeks.push(current);
        current = { week: String(label).trim(), month, metrics: {}, rates: {} };
        continue;
      }
      if (!current || typeof label !== "string") continue;

      const key = label.trim();
      if (METRIC_ALIASES[key]) {
        current.metrics[METRIC_ALIASES[key]] = sumDayValues(row);
      } else if (RATE_ALIASES[key]) {
        const avg = averagePercent(row);
        if (avg !== null) current.rates[RATE_ALIASES[key]] = avg;
      }
    }
    if (current) weeks.push(current);
  }

  // Sheets sometimes have next week's block pre-created as an empty
  // placeholder ahead of time. Drop any week that hasn't started yet so it
  // doesn't get mistaken for "latest" or show up as a fake dip in charts.
  const now = new Date();
  const started = weeks.filter((w) => {
    const range = parseWeekRange(w.week);
    return !range || range.start <= now; // fail open if the label doesn't parse
  });

  // Stale template blocks (leftover, never filled in) show up as all-zero
  // weeks anywhere but the end. The most recent started week is kept even
  // if it's all zero, since that just means it hasn't been filled in yet.
  return started.filter((w, i) => i === started.length - 1 || !isAllZero(w.metrics));
}

export function monthlyTotals(weeks, metricKey = "הזמנות ממכרזים") {
  const totals = new Map();
  for (const w of weeks) {
    totals.set(w.month, (totals.get(w.month) || 0) + (w.metrics[metricKey] || 0));
  }
  return MONTH_ORDER.filter((m) => totals.has(m)).map((month) => ({
    month,
    total: totals.get(month),
  }));
}
