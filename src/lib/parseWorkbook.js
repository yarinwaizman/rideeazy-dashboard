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

  // Stale template blocks (leftover, never filled in) show up as all-zero
  // weeks anywhere but the end. The most recent week is kept even if it's
  // all zero, since that's just an in-progress week with no data yet.
  return weeks.filter((w, i) => i === weeks.length - 1 || !isAllZero(w.metrics));
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
