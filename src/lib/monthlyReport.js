const HEBREW_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

export function formatMonthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return `${HEBREW_MONTHS[m - 1]} ${y}`;
}

function prevMonthKey(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1); // m is 1-indexed; -2 lands on the prior month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Every "YYYY-MM" that has either ops or revenue data, chronological.
export function availableMonths(days, revenueDays) {
  const set = new Set();
  for (const d of days) set.add(d.date.slice(0, 7));
  for (const d of revenueDays) set.add(d.date.slice(0, 7));
  return [...set].sort();
}

function sumOpsForMonth(days, ym) {
  const totals = {};
  for (const d of days) {
    if (d.date.slice(0, 7) !== ym) continue;
    for (const [k, v] of Object.entries(d.metrics)) totals[k] = (totals[k] || 0) + v;
  }
  return totals;
}

function sumRevenueForMonth(revenueDays, ym) {
  return revenueDays.filter((d) => d.date.slice(0, 7) === ym).reduce((s, d) => s + d.revenue, 0);
}

// A month's funnel + revenue totals alongside the prior month's, for a
// month-over-month executive summary (not the raw weekly breakdown).
export function monthSummary(days, revenueDays, ym) {
  const prevYm = prevMonthKey(ym);
  return {
    ym,
    label: formatMonthLabel(ym),
    prevLabel: formatMonthLabel(prevYm),
    metrics: sumOpsForMonth(days, ym),
    prevMetrics: sumOpsForMonth(days, prevYm),
    revenue: sumRevenueForMonth(revenueDays, ym),
    prevRevenue: sumRevenueForMonth(revenueDays, prevYm),
  };
}
