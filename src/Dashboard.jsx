import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from "recharts";
import { parseWorkbook, monthlyTotals, daysInRange, sumDayMetrics, METRIC_LABELS } from "./lib/parseWorkbook.js";
import {
  supportsFileSystemAccess,
  saveFileHandle,
  loadFileHandle,
  verifyPermission,
} from "./lib/fileHandle.js";
import logo from "./assets/rideeazy-logo.png";
import seedData from "./seedData.json";

const CACHE_KEY = "rideeazy-dashboard-cache";

// Palette pulled directly from app.rideeazy.co.il/landing-page
const NAVY = "#1C2047";
const TEAL = "#51DFD7";
const BORDER = "#E7E9EF";
const BG = "#F7F8FB";
const GRID = BORDER;

function pctChange(curr, prev) {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function Delta({ value }) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span style={{ color: "#A8ADBD", fontSize: 12 }}>—</span>;
  }
  const up = value >= 0;
  return (
    <span style={{ color: up ? "#1F9E76" : "#D5504A", fontSize: 12, fontWeight: 700 }}>
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(0)}%
    </span>
  );
}

function formatShortDate(iso) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function formatTimestamp(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Dashboard() {
  const [range, setRange] = useState("all"); // 'all' | '8w' | '4w'
  const [weeks, setWeeks] = useState(seedData.weeks);
  const [days, setDays] = useState(seedData.days || []);
  const [fileName, setFileName] = useState(seedData.fileName);
  const [lastLoaded, setLastLoaded] = useState(seedData.lastLoaded);
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [errorMsg, setErrorMsg] = useState(null);
  const fileInputRef = useRef(null);

  const applyData = useCallback((parsedWeeks, parsedDays, name) => {
    setWeeks(parsedWeeks);
    setDays(parsedDays);
    setFileName(name);
    const now = new Date().toISOString();
    setLastLoaded(now);
    setStatus("idle");
    setErrorMsg(null);
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ weeks: parsedWeeks, days: parsedDays, fileName: name, lastLoaded: now })
    );
  }, []);

  const parseAndApply = useCallback(
    async (file) => {
      setStatus("loading");
      try {
        const buf = await file.arrayBuffer();
        const workbook = XLSX.read(buf, { type: "array", cellDates: true });
        const { weeks: parsedWeeks, days: parsedDays } = parseWorkbook(workbook);
        applyData(parsedWeeks, parsedDays, file.name);
      } catch (err) {
        setStatus("error");
        setErrorMsg(err.message || "שגיאה בקריאת הקובץ");
      }
    },
    [applyData]
  );

  const pickFile = useCallback(async () => {
    if (supportsFileSystemAccess) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [
            {
              description: "Excel",
              accept: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
              },
            },
          ],
        });
        await saveFileHandle(handle);
        const file = await handle.getFile();
        await parseAndApply(file);
      } catch (err) {
        if (err.name !== "AbortError") {
          setStatus("error");
          setErrorMsg(err.message || "שגיאה בבחירת הקובץ");
        }
      }
    } else {
      fileInputRef.current?.click();
    }
  }, [parseAndApply]);

  const refresh = useCallback(async () => {
    if (supportsFileSystemAccess) {
      const handle = await loadFileHandle();
      if (handle) {
        setStatus("loading");
        try {
          const ok = await verifyPermission(handle);
          if (!ok) throw new Error("אין הרשאה לגשת לקובץ — יש לבחור אותו מחדש");
          const file = await handle.getFile();
          await parseAndApply(file);
        } catch (err) {
          setStatus("error");
          setErrorMsg(err.message || "שגיאה ברענון הקובץ");
        }
        return;
      }
    }
    pickFile();
  }, [parseAndApply, pickFile]);

  const onFileInputChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) parseAndApply(file);
      e.target.value = "";
    },
    [parseAndApply]
  );

  // On mount: paint instantly from cache, then try a silent refresh from the
  // remembered file handle (if the browser supports it and permission is
  // still granted).
  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setWeeks(parsed.weeks || []);
        setDays(parsed.days || []);
        setFileName(parsed.fileName || null);
        setLastLoaded(parsed.lastLoaded || null);
      } catch {
        // ignore corrupt cache
      }
    }
    if (supportsFileSystemAccess) {
      loadFileHandle().then(async (handle) => {
        if (!handle) return;
        const ok = await verifyPermission(handle).catch(() => false);
        if (!ok) return;
        const file = await handle.getFile();
        parseAndApply(file);
      });
    }
  }, [parseAndApply]);

  const data = useMemo(() => {
    if (range === "4w") return weeks.slice(-4);
    if (range === "8w") return weeks.slice(-8);
    return weeks;
  }, [range, weeks]);

  const latest = weeks[weeks.length - 1];
  const prev = weeks[weeks.length - 2];

  const kpis = [
    { key: "כניסות לאתר נחיתה", label: "כניסות לדף נחיתה" },
    { key: "הרשמות לאתר", label: "הרשמות" },
    { key: "הצעות מחיר", label: "הצעות מחיר" },
    { key: "מכרזים נפתחו", label: "מכרזים נפתחו" },
    { key: "הזמנות ממכרזים", label: "הזמנות סגורות" },
  ];

  const chartData = data.map((w) => ({
    week: w.week,
    "כניסות לדף נחיתה": w.metrics["כניסות לאתר נחיתה"] || 0,
    "הרשמות": w.metrics["הרשמות לאתר"] || 0,
    "הצעות מחיר": w.metrics["הצעות מחיר"] || 0,
    "הזמנות סגורות": w.metrics["הזמנות ממכרזים"] || 0,
  }));

  const rateData = weeks
    .filter((w) => Object.keys(w.rates).length > 0)
    .map((w) => ({
      week: w.week,
      "המרה לליד": w.rates["המרה לליד"] ? +(w.rates["המרה לליד"] * 100).toFixed(1) : 0,
      "פתיחת מכרז": w.rates["פתיחת מכרז"] ? +(w.rates["פתיחת מכרז"] * 100).toFixed(1) : 0,
      "מכירה": w.rates["מכירה"] ? +(w.rates["מכירה"] * 100).toFixed(1) : 0,
    }));

  const monthlyClosedOrders = useMemo(() => monthlyTotals(weeks, "הזמנות ממכרזים"), [weeks]);

  const allMetricKeys = Object.keys(METRIC_LABELS);

  const [dailyFrom, setDailyFrom] = useState("");
  const [dailyTo, setDailyTo] = useState("");

  const dailyResult = useMemo(() => {
    if (!dailyFrom) return null;
    const from = dailyFrom;
    const to = dailyTo && dailyTo >= from ? dailyTo : dailyFrom;
    const matched = daysInRange(days, from, to);
    const summary = sumDayMetrics(matched);

    const requestedDates = [];
    let d = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    while (d <= end) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      requestedDates.push(`${y}-${m}-${day}`);
      d.setDate(d.getDate() + 1);
    }
    const missingDates = requestedDates.filter(
      (date) => !matched.some((r) => r.date <= date && r.endDate >= date)
    );

    return { from, to, matched, summary, missingDates };
  }, [days, dailyFrom, dailyTo]);

  return (
    <div
      dir="rtl"
      style={{
        fontFamily:
          "'Open Sans Hebrew', 'Open Sans', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
        background: BG,
        color: NAVY,
        minHeight: "100vh",
        boxSizing: "border-box",
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        style={{ display: "none" }}
        onChange={onFileInputChange}
      />

      {/* Header */}
      <div
        style={{
          background: NAVY,
          padding: "22px 28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 12,
          borderBottom: `3px solid ${TEAL}`,
        }}
      >
        <div>
          <img src={logo} alt="Rideeazy" style={{ height: 28, marginBottom: 10, display: "block" }} />
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#FFFFFF" }}>
            דוח סטטוס תפעולי שבועי
          </h1>
          <div style={{ color: "#AEB3D0", fontSize: 13, marginTop: 4 }}>
            {weeks.length > 0
              ? `${weeks.length} שבועות · עודכן עד ${latest.week}`
              : "טרם נטענו נתונים"}
            {fileName ? ` · ${fileName}` : ""}
            {lastLoaded ? ` · נטען ${formatTimestamp(lastLoaded)}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={refresh}
            disabled={status === "loading"}
            style={{
              background: TEAL,
              color: NAVY,
              border: `1px solid ${TEAL}`,
              borderRadius: 2,
              padding: "6px 14px",
              fontSize: 13,
              cursor: status === "loading" ? "wait" : "pointer",
              fontWeight: 700,
            }}
          >
            {status === "loading" ? "טוען…" : "רענן נתונים"}
          </button>
          <button
            onClick={pickFile}
            style={{
              background: "transparent",
              color: "#D8DAEA",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 2,
              padding: "6px 14px",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            בחר קובץ אקסל…
          </button>
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.2)" }} />
          {[
            { id: "4w", label: "4 שבועות" },
            { id: "8w", label: "8 שבועות" },
            { id: "all", label: "הכל" },
          ].map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              style={{
                background: range === r.id ? TEAL : "transparent",
                color: range === r.id ? NAVY : "#D8DAEA",
                border: `1px solid ${range === r.id ? TEAL : "rgba(255,255,255,0.25)"}`,
                borderRadius: 2,
                padding: "6px 14px",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!supportsFileSystemAccess && (
        <div style={{ background: "#FFF7E6", color: "#8A6116", fontSize: 12.5, padding: "8px 28px" }}>
          הדפדפן שלך לא תומך בזכירת קובץ אוטומטית — בכל "רענן נתונים" תתבקש לבחור מחדש את קובץ האקסל.
          (נתמך ב-Chrome / Edge)
        </div>
      )}
      {status === "error" && (
        <div style={{ background: "#FDECEC", color: "#B23A34", fontSize: 12.5, padding: "8px 28px" }}>
          {errorMsg}
        </div>
      )}

      <div style={{ padding: "28px 28px 32px" }}>
        {weeks.length === 0 ? (
          <div
            style={{
              background: "#FFFFFF",
              border: `1px solid ${BORDER}`,
              borderRadius: 3,
              padding: 40,
              textAlign: "center",
              color: "#6B7099",
            }}
          >
            עדיין אין נתונים. לחץ "בחר קובץ אקסל…" כדי לטעון את קובץ הסטטוס.
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: 14,
                marginBottom: 32,
              }}
            >
              {kpis.map((k) => {
                const curr = latest.metrics[k.key] || 0;
                const before = prev ? prev.metrics[k.key] || 0 : 0;
                return (
                  <div
                    key={k.key}
                    style={{
                      background: "#FFFFFF",
                      border: `1px solid ${BORDER}`,
                      borderTop: `3px solid ${TEAL}`,
                      borderRadius: 3,
                      padding: "16px 18px",
                      boxShadow: "0 1px 3px rgba(28,32,71,0.05)",
                    }}
                  >
                    <div style={{ fontSize: 12.5, color: "#6B7099", marginBottom: 8, fontWeight: 600 }}>
                      {k.label}
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <span style={{ fontSize: 26, fontWeight: 700, color: NAVY }}>{curr}</span>
                      <Delta value={pctChange(curr, before)} />
                    </div>
                    <div style={{ fontSize: 11, color: "#9498B5", marginTop: 4 }}>
                      שבוע קודם: {before}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Daily view */}
            <div
              style={{
                background: "#FFFFFF",
                border: `1px solid ${BORDER}`,
                borderRadius: 3,
                padding: "20px 20px",
                marginBottom: 24,
                boxShadow: "0 1px 3px rgba(28,32,71,0.05)",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: NAVY }}>
                תצוגה יומית
              </div>
              <div style={{ fontSize: 12, color: "#8B90AD", marginBottom: 14 }}>
                בחרו תאריך בודד, או טווח תאריכים, לצפייה בנתונים היומיים
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                <label style={{ fontSize: 12.5, color: "#6B7099", display: "flex", alignItems: "center", gap: 6 }}>
                  מתאריך
                  <input
                    type="date"
                    value={dailyFrom}
                    onChange={(e) => setDailyFrom(e.target.value)}
                    style={{ border: `1px solid ${BORDER}`, borderRadius: 3, padding: "5px 8px", fontSize: 13 }}
                  />
                </label>
                <label style={{ fontSize: 12.5, color: "#6B7099", display: "flex", alignItems: "center", gap: 6 }}>
                  עד תאריך (אופציונלי)
                  <input
                    type="date"
                    value={dailyTo}
                    onChange={(e) => setDailyTo(e.target.value)}
                    style={{ border: `1px solid ${BORDER}`, borderRadius: 3, padding: "5px 8px", fontSize: 13 }}
                  />
                </label>
                {(dailyFrom || dailyTo) && (
                  <button
                    onClick={() => {
                      setDailyFrom("");
                      setDailyTo("");
                    }}
                    style={{
                      background: "transparent",
                      color: "#6B7099",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 3,
                      padding: "5px 12px",
                      fontSize: 12.5,
                      cursor: "pointer",
                    }}
                  >
                    נקה
                  </button>
                )}
              </div>

              {!dailyResult ? (
                <div style={{ fontSize: 12.5, color: "#9498B5" }}>
                  לדוגמה: בחרו 01/07/26 לתאריך בודד, או 07/06/26 עד 11/06/26 לטווח.
                </div>
              ) : dailyResult.matched.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "#B23A34" }}>
                  אין נתונים רשומים עבור {dailyResult.from === dailyResult.to ? dailyResult.from : `${dailyResult.from} – ${dailyResult.to}`}.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    {kpis.map((k) => (
                      <div
                        key={k.key}
                        style={{
                          background: BG,
                          border: `1px solid ${BORDER}`,
                          borderRadius: 3,
                          padding: "10px 14px",
                        }}
                      >
                        <div style={{ fontSize: 11.5, color: "#6B7099", marginBottom: 4, fontWeight: 600 }}>
                          {k.label}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>
                          {dailyResult.summary[k.key] || 0}
                        </div>
                      </div>
                    ))}
                  </div>

                  {dailyResult.missingDates.length > 0 && (
                    <div style={{ fontSize: 12, color: "#B8860B", background: "#FFF7E6", padding: "8px 12px", borderRadius: 3, marginBottom: 16 }}>
                      אין נתונים רשומים עבור: {dailyResult.missingDates.join(", ")} — ייתכן שלא הוזנו נתונים לתאריך זה
                      בקובץ (להבדיל מנתון אפס בפועל).
                    </div>
                  )}

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 600 }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>תאריך</th>
                          {allMetricKeys.map((k) => (
                            <th key={k} style={thStyle}>
                              {METRIC_LABELS[k]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dailyResult.matched.map((r, i) => (
                          <tr key={r.date + i} style={{ background: i % 2 === 0 ? "#FFFFFF" : "#F7F8FB" }}>
                            <td style={{ ...tdStyle, fontWeight: 700, color: NAVY }}>
                              {r.label} · {r.date === r.endDate ? formatShortDate(r.date) : `${formatShortDate(r.date)}–${formatShortDate(r.endDate)}`}
                            </td>
                            {allMetricKeys.map((k) => (
                              <td key={k} style={tdStyle}>
                                {r.metrics[k] ?? "–"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Funnel trend chart */}
            <div
              style={{
                background: "#FFFFFF",
                border: `1px solid ${BORDER}`,
                borderRadius: 3,
                padding: "20px 20px 8px",
                marginBottom: 24,
                boxShadow: "0 1px 3px rgba(28,32,71,0.05)",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: NAVY }}>
                מגמת המשפך השבועית
              </div>
              <div style={{ fontSize: 12, color: "#8B90AD", marginBottom: 12 }}>
                כניסות → הרשמות → הצעות מחיר → הזמנות סגורות
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="week" tick={{ fill: "#8B90AD", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#8B90AD", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: NAVY, fontWeight: 700 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="כניסות לדף נחיתה" fill="#DDE1EE" radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="הרשמות" stroke={NAVY} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="הצעות מחיר" stroke="#8B90AD" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="הזמנות סגורות" stroke={TEAL} strokeWidth={3} dot={{ r: 3, fill: TEAL }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly closed-orders summary */}
            <div
              style={{
                background: "#FFFFFF",
                border: `1px solid ${BORDER}`,
                borderRadius: 3,
                padding: "20px 20px 8px",
                marginBottom: 24,
                boxShadow: "0 1px 3px rgba(28,32,71,0.05)",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: NAVY }}>
                סה״כ הזמנות שנסגרו לפי חודש
              </div>
              <div style={{ fontSize: 12, color: "#8B90AD", marginBottom: 12 }}>
                סכום "הזמנות ממכרזים" מכל השבועות בכל חודש
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyClosedOrders} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="month" tick={{ fill: "#8B90AD", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#8B90AD", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: NAVY, fontWeight: 700 }}
                  />
                  <Bar dataKey="total" name="הזמנות סגורות" fill={TEAL} radius={[3, 3, 0, 0]}>
                    <LabelList dataKey="total" position="top" style={{ fill: NAVY, fontSize: 12, fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Conversion rates (only weeks that have this data) */}
            {rateData.length > 0 && (
              <div
                style={{
                  background: "#FFFFFF",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 3,
                  padding: "20px 20px 8px",
                  marginBottom: 24,
                  boxShadow: "0 1px 3px rgba(28,32,71,0.05)",
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: NAVY }}>
                  אחוזי המרה
                </div>
                <div style={{ fontSize: 12, color: "#8B90AD", marginBottom: 12 }}>
                  החל מהמעקב שהתווסף באמצע יוני
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={rateData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="week" tick={{ fill: "#8B90AD", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#8B90AD", fontSize: 11 }} unit="%" />
                    <Tooltip
                      contentStyle={{ background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: NAVY, fontWeight: 700 }}
                      formatter={(v) => `${v}%`}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="המרה לליד" stroke={NAVY} strokeWidth={2} />
                    <Line type="monotone" dataKey="פתיחת מכרז" stroke={TEAL} strokeWidth={2.5} />
                    <Line type="monotone" dataKey="מכירה" stroke="#D5504A" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Full data table */}
            <div
              style={{
                background: "#FFFFFF",
                border: `1px solid ${BORDER}`,
                borderRadius: 3,
                padding: 20,
                marginBottom: 12,
                boxShadow: "0 1px 3px rgba(28,32,71,0.05)",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: NAVY }}>
                פירוט שבועי מלא
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>שבוע</th>
                      {allMetricKeys.map((k) => (
                        <th key={k} style={thStyle}>
                          {METRIC_LABELS[k]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((w, i) => (
                      <tr key={w.week + i} style={{ background: i % 2 === 0 ? "#FFFFFF" : "#F7F8FB" }}>
                        <td style={{ ...tdStyle, fontWeight: 700, color: NAVY }}>{w.week}</td>
                        {allMetricKeys.map((k) => (
                          <td key={k} style={tdStyle}>
                            {w.metrics[k] ?? "–"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const thStyle = {
  textAlign: "center",
  padding: "8px 10px",
  borderBottom: `2px solid ${NAVY}`,
  color: "#6B7099",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const tdStyle = {
  textAlign: "center",
  padding: "7px 10px",
  color: "#3A3F63",
  whiteSpace: "nowrap",
};
