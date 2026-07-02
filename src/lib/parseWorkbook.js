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
  // "closed orders" combines both sources: closed via a tender, and closed
  // directly through the system without one.
  "הזמנות ממכרזים": "הזמנות ממכרזים",
  "סגירות ממכרזים": "הזמנות ממכרזים",
  "סגירות מהמערכת": "הזמנות ממכרזים",
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

// Columns 1-6 are the day-of-week values (Sun, Mon, Tue, Wed, Thu, then a
// combined Fri+Sat "weekend" column); column 7 is a pre-computed total
// that's sometimes left blank for weeks still in progress, so weekly totals
// are always derived by summing these 6 values ourselves.
function rowMetricValues(row) {
  const vals = [];
  for (let i = 1; i <= 6; i++) vals.push(i < row.length ? toNumber(row[i]) : null);
  return vals;
}

function rowRateValues(row) {
  const vals = [];
  for (let i = 1; i <= 6; i++) {
    const cell = i < row.length ? row[i] : null;
    if (typeof cell === "string" && cell.trim().endsWith("%")) {
      const n = Number(cell.trim().replace("%", ""));
      vals.push(Number.isNaN(n) ? null : n / 100);
    } else {
      vals.push(null);
    }
  }
  return vals;
}

function sumNonNull(vals) {
  return vals.reduce((acc, v) => (v !== null ? acc + v : acc), 0);
}

function averageNonNull(vals) {
  const present = vals.filter((v) => v !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
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

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

const WEEKDAY_LABELS = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "שישי-שבת"];

// Column 6 (index 5) combines Friday+Saturday into one number with no way
// to split it further, so it becomes a single record spanning both dates
// rather than two separate days.
function buildDayRecords(weekLabel, month, columns, rateColumns) {
  const range = parseWeekRange(weekLabel);
  if (!range) return [];
  // The week's Sunday: column 1 always lands on Sunday of the ISO/Israeli
  // (Sun-start) week containing the label's end date.
  const sunday = addDays(range.end, -range.end.getDay());

  const records = [];
  for (let i = 0; i < 6; i++) {
    const metrics = {};
    for (const [canonical, vals] of Object.entries(columns)) {
      if (vals[i] !== null) metrics[canonical] = vals[i];
    }
    const rates = {};
    for (const [canonical, vals] of Object.entries(rateColumns)) {
      if (vals[i] !== null) rates[canonical] = vals[i];
    }
    if (Object.keys(metrics).length === 0 && Object.keys(rates).length === 0) continue;

    const date = addDays(sunday, i);
    const endDate = i === 5 ? addDays(sunday, 6) : date;
    records.push({
      date: toISODate(date),
      endDate: toISODate(endDate),
      label: WEEKDAY_LABELS[i],
      month,
      metrics,
      rates,
    });
  }
  return records;
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
        current = { week: String(label).trim(), month, columns: {}, rateColumns: {} };
        continue;
      }
      if (!current || typeof label !== "string") continue;

      const key = label.trim();
      if (METRIC_ALIASES[key]) {
        // Accumulate rather than overwrite: some canonical metrics (like
        // closed orders) are split across multiple source rows within the
        // same week block (e.g. closed via tender + closed via system).
        const canonical = METRIC_ALIASES[key];
        const vals = rowMetricValues(row);
        if (!current.columns[canonical]) current.columns[canonical] = [null, null, null, null, null, null];
        for (let i = 0; i < 6; i++) {
          if (vals[i] !== null) current.columns[canonical][i] = (current.columns[canonical][i] || 0) + vals[i];
        }
      } else if (RATE_ALIASES[key]) {
        const canonical = RATE_ALIASES[key];
        current.rateColumns[canonical] = rowRateValues(row);
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

  const withTotals = started.map((w) => {
    const metrics = {};
    for (const [canonical, vals] of Object.entries(w.columns)) metrics[canonical] = sumNonNull(vals);
    const rates = {};
    for (const [canonical, vals] of Object.entries(w.rateColumns)) {
      const avg = averageNonNull(vals);
      if (avg !== null) rates[canonical] = avg;
    }
    return { week: w.week, month: w.month, metrics, rates, columns: w.columns, rateColumns: w.rateColumns };
  });

  // Stale template blocks (leftover, never filled in) show up as all-zero
  // weeks anywhere but the end. The most recent started week is kept even
  // if it's all zero, since that just means it hasn't been filled in yet.
  const finalWeeks = withTotals.filter((w, i) => i === withTotals.length - 1 || !isAllZero(w.metrics));

  const days = finalWeeks.flatMap((w) => buildDayRecords(w.week, w.month, w.columns, w.rateColumns));

  // Drop the internal per-column data before returning weeks publicly.
  const weeksOut = finalWeeks.map(({ week, month, metrics, rates }) => ({ week, month, metrics, rates }));

  return { weeks: weeksOut, days };
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

// Days whose [date, endDate] range overlaps [fromISO, toISO] (inclusive).
// The combined Friday-Saturday record is matched if either date falls in
// range, so a query that only touches one side of the weekend still finds it.
export function daysInRange(days, fromISO, toISO) {
  const to = toISO || fromISO;
  return days
    .filter((d) => d.date <= to && d.endDate >= fromISO)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function sumDayMetrics(dayRecords) {
  const metrics = {};
  for (const d of dayRecords) {
    for (const [k, v] of Object.entries(d.metrics)) metrics[k] = (metrics[k] || 0) + v;
  }
  return metrics;
}
