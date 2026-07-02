import Papa from "papaparse";

// The finance export lists several document types (quotes, credit notes,
// transaction invoices...); only "חשבונית מס קבלה" (tax invoice/receipt)
// represents money actually received, so that's the only type counted as
// revenue.
const RECEIPT_TYPE = "חשבונית מס קבלה";

export const HEBREW_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

const WEEKDAY_LABELS = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "שבת"];

function parseDMY(str) {
  if (!str) return null;
  const [d, m, y] = str.split("/").map(Number);
  if (!d || !m || !y) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
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

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Revenue per calendar day, summed across all receipts issued that day.
export function parseRevenueCsv(csvText) {
  const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const totals = new Map();
  for (const row of data) {
    if (row["סוג מסמך"] !== RECEIPT_TYPE) continue;
    const date = parseDMY(row["תאריך מסמך"]);
    if (!date) continue;
    const amount = parseFloat(row["סה\"כ"]);
    if (Number.isNaN(amount)) continue;
    const iso = toISODate(date);
    totals.set(iso, (totals.get(iso) || 0) + amount);
  }
  return [...totals.entries()]
    .map(([date, revenue]) => ({ date, revenue: round2(revenue) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function weekSundayOf(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return addDays(d, -d.getDay());
}

function formatWeekLabel(sunday) {
  const saturday = addDays(sunday, 6);
  const dd = (d) => String(d.getDate()).padStart(2, "0");
  const mm = (d) => String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(saturday.getFullYear()).slice(-2);
  if (sunday.getMonth() === saturday.getMonth()) {
    return `${dd(sunday)}-${dd(saturday)}.${mm(saturday)}.${yy}`;
  }
  return `${dd(sunday)}.${mm(sunday)}-${dd(saturday)}.${mm(saturday)}.${yy}`;
}

// Revenue bucketed into Sun-Sat calendar weeks — independent of the
// operational Excel's week blocks, since the revenue export covers a much
// wider date range (it starts months before daily ops tracking did).
export function weeklyRevenue(revenueDays) {
  const totals = new Map();
  for (const { date, revenue } of revenueDays) {
    const key = toISODate(weekSundayOf(date));
    totals.set(key, (totals.get(key) || 0) + revenue);
  }
  return [...totals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([sundayISO, revenue]) => ({
      weekStart: sundayISO,
      label: formatWeekLabel(new Date(`${sundayISO}T00:00:00`)),
      revenue: round2(revenue),
    }));
}

// Revenue bucketed by calendar month, year-aware (the export spans two
// years), sorted chronologically rather than by a fixed month-name order.
export function monthlyRevenue(revenueDays) {
  const totals = new Map();
  for (const { date, revenue } of revenueDays) {
    const key = date.slice(0, 7); // "YYYY-MM"
    totals.set(key, (totals.get(key) || 0) + revenue);
  }
  return [...totals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, revenue]) => {
      const [y, m] = ym.split("-").map(Number);
      return { key: ym, label: `${HEBREW_MONTHS[m - 1]} ${String(y).slice(-2)}`, revenue: round2(revenue) };
    });
}

// Folds revenue into the existing per-day funnel records (matching by date,
// including the combined Friday+Saturday "weekend" record), so the daily
// view's date picker shows revenue alongside operational metrics. Days with
// revenue but no funnel record (e.g. before ops tracking started) are added
// as new standalone day records.
export function mergeRevenueIntoDays(days, revenueDays, metricKey = "הכנסות") {
  const merged = days.map((d) => ({ ...d, metrics: { ...d.metrics } }));
  for (const { date, revenue } of revenueDays) {
    const existing = merged.find((d) => d.date <= date && d.endDate >= date);
    if (existing) {
      existing.metrics[metricKey] = round2((existing.metrics[metricKey] || 0) + revenue);
    } else {
      const d = new Date(`${date}T00:00:00`);
      merged.push({
        date,
        endDate: date,
        label: WEEKDAY_LABELS[d.getDay()],
        month: HEBREW_MONTHS[d.getMonth()],
        metrics: { [metricKey]: revenue },
        rates: {},
      });
    }
  }
  return merged.sort((a, b) => a.date.localeCompare(b.date));
}
