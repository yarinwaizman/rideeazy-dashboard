const shekelFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function formatShekel(v) {
  return shekelFormatter.format(v || 0);
}

export function formatShekelShort(v) {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}K ₪`;
  return `${Math.round(v)} ₪`;
}

export function pctChange(curr, prev) {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

export function formatTimestamp(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
