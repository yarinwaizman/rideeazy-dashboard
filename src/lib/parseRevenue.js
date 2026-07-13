import Papa from "papaparse";

// The finance export lists several document types (quotes, transaction
// invoices...); only "חשבונית מס קבלה" (tax invoice/receipt) represents
// money actually received, so it's the type counted as revenue — minus
// invoices that were later cancelled, which "חשבונית זיכוי" (credit
// invoice) rows reveal.
//
// Credits matter because of how EZcount handles a cancelled invoice (e.g.
// one re-issued to a different payer): the cancelled original still appears
// in the export as a normal positive receipt-invoice row — the export has
// no status column, so its "מבוטל" status is invisible here — and the
// cancellation shows up only as a credit-invoice row. Each credit is
// matched back to its original invoice (same customer + amount, issued on
// or before the credit) and that invoice is dropped from its own date, so
// the cancellation corrects the week/month the revenue was originally
// booked in rather than showing up as negative revenue on the credit's
// date. Credits with no identifiable original (e.g. partial credits) fall
// back to being subtracted on their own date. The negative "קבלה"
// (receipt) row that accompanies each credit stays ignored like all
// receipts, otherwise the reversal would be counted twice.
const RECEIPT_TYPE = "חשבונית מס קבלה";
const CREDIT_TYPE = "חשבונית זיכוי";

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

// Revenue per calendar day: receipt-invoices summed by issue date, with
// credited (cancelled) invoices removed — see the credit-matching note at
// the top of this file.
export function parseRevenueCsv(csvText) {
  const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  const normName = (s) => (s || "").replace(/\s+/g, " ").trim();

  const invoices = [];
  const credits = [];
  for (const row of data) {
    const type = row["סוג מסמך"];
    if (type !== RECEIPT_TYPE && type !== CREDIT_TYPE) continue;
    const date = parseDMY(row["תאריך מסמך"]);
    if (!date) continue;
    const amount = parseFloat(row["סה\"כ"]);
    if (Number.isNaN(amount)) continue;
    const entry = { iso: toISODate(date), name: normName(row["שם לקוח"]), amount };
    (type === RECEIPT_TYPE ? invoices : credits).push(entry);
  }

  // Match each credit to the original invoice it reverses: same customer
  // and amount, issued on or before the credit — the latest such invoice
  // not already consumed by another credit.
  const cancelled = new Set();
  const unmatchedCredits = [];
  for (const credit of credits) {
    let best = -1;
    for (let i = 0; i < invoices.length; i++) {
      if (cancelled.has(i)) continue;
      const inv = invoices[i];
      if (inv.name !== credit.name) continue;
      if (Math.abs(inv.amount) !== Math.abs(credit.amount)) continue;
      if (inv.iso > credit.iso) continue;
      if (best === -1 || inv.iso > invoices[best].iso) best = i;
    }
    if (best >= 0) cancelled.add(best);
    else unmatchedCredits.push(credit);
  }

  const totals = new Map();
  for (let i = 0; i < invoices.length; i++) {
    if (cancelled.has(i)) continue;
    const { iso, amount } = invoices[i];
    totals.set(iso, (totals.get(iso) || 0) + amount);
  }
  for (const { iso, amount } of unmatchedCredits) {
    totals.set(iso, (totals.get(iso) || 0) - Math.abs(amount));
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
