import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
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
import { parseRevenueCsv, weeklyRevenue, monthlyRevenue, mergeRevenueIntoDays } from "./lib/parseRevenue.js";
import { supportsFileSystemAccess, EXCEL_HANDLE_KEY, REVENUE_HANDLE_KEY } from "./lib/fileHandle.js";
import { useLoadableFile } from "./lib/useLoadableFile.js";
import { fetchDatasets, saveDataset, OPS_DATASET, REVENUE_DATASET } from "./lib/datasets.js";
import { availableMonths, monthSummary, formatMonthLabel } from "./lib/monthlyReport.js";
import { supabase } from "./lib/supabaseClient.js";
import { formatShekel, formatShekelShort, pctChange, formatTimestamp } from "./lib/format.js";
import { downloadMonthlyReportPdf } from "./lib/pdf/MonthlyReportPdf.jsx";
import { downloadDashboardPdf } from "./lib/pdf/DashboardPdf.jsx";
import { captureChartAsPng } from "./lib/pdf/captureChart.js";
import logo from "./assets/rideeazy-logo.png";

const REVENUE_KEY = "הכנסות";

async function parseExcelFile(file) {
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: "array", cellDates: true });
  return parseWorkbook(workbook);
}

async function parseRevenueFile(file) {
  const text = await file.text();
  return parseRevenueCsv(text);
}

// Palette pulled directly from app.rideeazy.co.il/landing-page
const NAVY = "#1C2047";
const TEAL = "#51DFD7";
const BORDER = "#E7E9EF";
const BG = "#F7F8FB";
const GRID = BORDER;
const RADIUS = 16; // cards, inputs
const RADIUS_PILL = 999; // buttons, tabs

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

const EXCEL_ACCEPT = {
  description: "Excel",
  accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
};
const CSV_ACCEPT = { description: "CSV", accept: { "text/csv": [".csv"] } };

export default function Dashboard() {
  const [range, setRange] = useState("all"); // 'all' | '8w' | '4w'

  // DOM refs to each chart's wrapping div, used to rasterize the live
  // Recharts <svg> into a PNG for the full-dashboard PDF export (react-pdf
  // can't render Recharts directly).
  const weeklyRevenueChartRef = useRef(null);
  const monthlyRevenueChartRef = useRef(null);
  const funnelTrendChartRef = useRef(null);
  const monthlyClosedOrdersChartRef = useRef(null);
  const conversionRatesChartRef = useRef(null);

  // Cloud-backed datasets — the single source of truth for every device.
  // Uploading a file on any machine writes here, so everyone stays in sync.
  const [ops, setOps] = useState(null); // { weeks, days, fileName, lastLoaded }
  const [revenue, setRevenue] = useState(null); // { days, fileName, lastLoaded }
  const [cloudStatus, setCloudStatus] = useState("loading"); // loading | ready | error
  const [cloudError, setCloudError] = useState(null);

  useEffect(() => {
    fetchDatasets()
      .then((rows) => {
        if (rows[OPS_DATASET]) setOps(rows[OPS_DATASET].payload);
        if (rows[REVENUE_DATASET]) setRevenue(rows[REVENUE_DATASET].payload);
        setCloudStatus("ready");
      })
      .catch((err) => {
        setCloudStatus("error");
        setCloudError(err.message);
      });
  }, []);

  const onOpsParsed = useCallback(async (parsed, fileName) => {
    const payload = { weeks: parsed.weeks, days: parsed.days, fileName, lastLoaded: new Date().toISOString() };
    await saveDataset(OPS_DATASET, payload);
    setOps(payload);
  }, []);

  const onRevenueParsed = useCallback(async (parsed, fileName) => {
    const payload = { days: parsed, fileName, lastLoaded: new Date().toISOString() };
    await saveDataset(REVENUE_DATASET, payload);
    setRevenue(payload);
  }, []);

  const excelLoader = useLoadableFile({
    handleKey: EXCEL_HANDLE_KEY,
    parse: parseExcelFile,
    accept: EXCEL_ACCEPT,
    onParsed: onOpsParsed,
  });

  const revenueLoader = useLoadableFile({
    handleKey: REVENUE_HANDLE_KEY,
    parse: parseRevenueFile,
    accept: CSV_ACCEPT,
    onParsed: onRevenueParsed,
  });

  const weeks = ops?.weeks || [];
  const days = ops?.days || [];
  const revenueDays = revenue?.days || [];

  const data = useMemo(() => {
    if (range === "4w") return weeks.slice(-4);
    if (range === "8w") return weeks.slice(-8);
    return weeks;
  }, [range, weeks]);

  const latest = weeks[weeks.length - 1];
  const prev = weeks[weeks.length - 2];

  const kpis = [
    { key: "כניסות לאתר נחיתה", label: METRIC_LABELS["כניסות לאתר נחיתה"] },
    { key: "הרשמות לאתר", label: METRIC_LABELS["הרשמות לאתר"] },
    { key: "הצעות מחיר", label: METRIC_LABELS["הצעות מחיר"] },
    { key: "מכרזים נפתחו", label: METRIC_LABELS["מכרזים נפתחו"] },
    { key: "הזמנות ממכרזים", label: METRIC_LABELS["הזמנות ממכרזים"] },
  ];

  const chartData = data.map((w) => ({
    week: w.week,
    "כניסות לדף נחיתה": w.metrics["כניסות לאתר נחיתה"] || 0,
    "הרשמות לאתר": w.metrics["הרשמות לאתר"] || 0,
    "הצעות מחיר": w.metrics["הצעות מחיר"] || 0,
    "הזמנות": w.metrics["הזמנות ממכרזים"] || 0,
  }));

  const rateData = weeks
    .filter((w) => Object.keys(w.rates).length > 0)
    .map((w) => ({
      week: w.week,
      "המרה לליד": w.rates["המרה לליד"] ? +(w.rates["המרה לליד"] * 100).toFixed(1) : 0,
      "פתיחת מכרז": w.rates["פתיחת מכרז"] ? +(w.rates["פתיחת מכרז"] * 100).toFixed(1) : 0,
      "מכירה": w.rates["מכירה"] ? +(w.rates["מכירה"] * 100).toFixed(1) : 0,
    }));

  const monthlyClosedOrders = useMemo(() => monthlyTotals(days, "הזמנות ממכרזים"), [days]);

  const allMetricKeys = Object.keys(METRIC_LABELS);

  // Revenue comes from a separate CSV covering its own date range, so it's
  // folded into the daily records (matched by date) rather than forced into
  // the Excel's own week blocks.
  const mergedDays = useMemo(() => mergeRevenueIntoDays(days, revenueDays), [days, revenueDays]);
  const dailyMetricKeys = revenueDays.length > 0 ? [...allMetricKeys, REVENUE_KEY] : allMetricKeys;
  const dailyMetricLabels = { ...METRIC_LABELS, [REVENUE_KEY]: "הכנסות" };
  const dailyKpis = revenueDays.length > 0 ? [...kpis, { key: REVENUE_KEY, label: "הכנסות" }] : kpis;

  const weeklyRevenueData = useMemo(() => weeklyRevenue(revenueDays), [revenueDays]);
  const monthlyRevenueData = useMemo(() => monthlyRevenue(revenueDays), [revenueDays]);
  const [revenueRange, setRevenueRange] = useState("12w"); // '12w' | 'all'
  const revenueChartData = useMemo(() => {
    if (revenueRange === "12w") return weeklyRevenueData.slice(-12);
    return weeklyRevenueData;
  }, [weeklyRevenueData, revenueRange]);
  const latestRevenueWeek = weeklyRevenueData[weeklyRevenueData.length - 1];
  const prevRevenueWeek = weeklyRevenueData[weeklyRevenueData.length - 2];

  const [dailyFrom, setDailyFrom] = useState("");
  const [dailyTo, setDailyTo] = useState("");

  const dailyResult = useMemo(() => {
    if (!dailyFrom) return null;
    const from = dailyFrom;
    const to = dailyTo && dailyTo >= from ? dailyTo : dailyFrom;
    const matched = daysInRange(mergedDays, from, to);
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
  }, [mergedDays, dailyFrom, dailyTo]);

  const [pdfExporting, setPdfExporting] = useState(false);
  const exportPdf = async () => {
    if (!latest) return;
    setPdfExporting(true);
    try {
      const kpiCards = kpis.map((k) => ({
        label: k.label,
        curr: latest.metrics[k.key] || 0,
        before: prev ? prev.metrics[k.key] || 0 : 0,
      }));
      const tableColumns = allMetricKeys.map((k) => METRIC_LABELS[k]);
      const tableRows = data.map((w) => ({
        week: w.week,
        values: allMetricKeys.map((k) => w.metrics[k] ?? "–"),
      }));
      // Recharts renders <Legend> as an HTML element beside the <svg>, not
      // inside it, so rasterizing the svg alone drops it — supply the same
      // series/colors here and render the legend as real PDF text instead.
      const chartRefsWithTitles = [
        {
          title: "מגמת המשפך השבועית",
          ref: funnelTrendChartRef,
          legend: [
            { label: "כניסות לדף נחיתה", color: "#DDE1EE" },
            { label: "הרשמות לאתר", color: NAVY },
            { label: "הצעות מחיר", color: "#8B90AD" },
            { label: "הזמנות", color: TEAL },
          ],
        },
        { title: "הכנסות שבועיות", ref: weeklyRevenueChartRef },
        { title: "הכנסות חודשיות", ref: monthlyRevenueChartRef },
        { title: "סה״כ הזמנות שנסגרו לפי חודש", ref: monthlyClosedOrdersChartRef },
        {
          title: "אחוזי המרה",
          ref: conversionRatesChartRef,
          legend: [
            { label: "המרה לליד", color: NAVY },
            { label: "פתיחת מכרז", color: TEAL },
            { label: "מכירה", color: "#D5504A" },
          ],
        },
      ];
      const charts = await Promise.all(
        chartRefsWithTitles.map(async ({ title, ref, legend }) => {
          const capture = await captureChartAsPng(ref.current);
          return capture ? { title, legend, ...capture } : null;
        })
      );
      const subtitle = `${weeks.length} שבועות · עודכן עד ${latest.week}${ops?.fileName ? ` · ${ops.fileName}` : ""}`;
      await downloadDashboardPdf({ subtitle, kpis: kpiCards, tableColumns, tableRows, charts });
    } finally {
      setPdfExporting(false);
    }
  };

  // Monthly report: a concise MoM executive summary for one month, exported
  // as its own PDF (see lib/pdf/MonthlyReportPdf.jsx).
  const reportMonths = useMemo(() => availableMonths(days, revenueDays), [days, revenueDays]);
  const [reportMonth, setReportMonth] = useState("");
  useEffect(() => {
    if (reportMonth || reportMonths.length === 0) return;
    const currentYm = new Date().toISOString().slice(0, 7);
    const isCurrentInProgress = reportMonths[reportMonths.length - 1] === currentYm && reportMonths.length > 1;
    setReportMonth(isCurrentInProgress ? reportMonths[reportMonths.length - 2] : reportMonths[reportMonths.length - 1]);
  }, [reportMonths, reportMonth]);
  const report = useMemo(
    () => (reportMonth ? monthSummary(days, revenueDays, reportMonth) : null),
    [days, revenueDays, reportMonth]
  );

  const [reportExporting, setReportExporting] = useState(false);
  const exportMonthlyReport = async () => {
    if (!report) return;
    setReportExporting(true);
    try {
      await downloadMonthlyReportPdf({ report, kpis, revenueKey: REVENUE_KEY });
    } finally {
      setReportExporting(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="dashboard-root"
      style={{
        fontFamily:
          "'Rubik', 'Open Sans Hebrew', 'Open Sans', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
        background: BG,
        color: NAVY,
        minHeight: "100vh",
        boxSizing: "border-box",
      }}
    >
      <input
        ref={excelLoader.fileInputRef}
        type="file"
        accept=".xlsx"
        style={{ display: "none" }}
        onChange={excelLoader.onFileInputChange}
      />
      <input
        ref={revenueLoader.fileInputRef}
        type="file"
        accept=".csv"
        style={{ display: "none" }}
        onChange={revenueLoader.onFileInputChange}
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
          <img src={logo} alt="Rideeazy" style={{ height: 46, marginBottom: 12, display: "block" }} />
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#FFFFFF" }}>
            דוח סטטוס תפעולי
          </h1>
          <div style={{ color: "#AEB3D0", fontSize: 13, marginTop: 4 }}>
            {weeks.length > 0
              ? `${weeks.length} שבועות · עודכן עד ${latest.week}`
              : "טרם נטענו נתונים"}
            {ops?.fileName ? ` · ${ops.fileName}` : ""}
            {ops?.lastLoaded ? ` · עודכן ${formatTimestamp(ops.lastLoaded)}` : ""}
          </div>
        </div>
        <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={exportPdf}
            disabled={pdfExporting}
            style={{
              background: "transparent",
              color: "#D8DAEA",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: RADIUS_PILL,
              padding: "6px 14px",
              fontSize: 13,
              cursor: pdfExporting ? "wait" : "pointer",
              fontWeight: 700,
            }}
          >
            {pdfExporting ? "מייצא…" : "ייצוא ל-PDF"}
          </button>
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.2)" }} />
          <button
            onClick={excelLoader.refresh}
            disabled={excelLoader.status === "loading"}
            style={{
              background: TEAL,
              color: NAVY,
              border: `1px solid ${TEAL}`,
              borderRadius: RADIUS_PILL,
              padding: "6px 14px",
              fontSize: 13,
              cursor: excelLoader.status === "loading" ? "wait" : "pointer",
              fontWeight: 700,
            }}
          >
            {excelLoader.status === "loading" ? "טוען…" : "רענן נתונים"}
          </button>
          <button
            onClick={excelLoader.pickFile}
            style={{
              background: "transparent",
              color: "#D8DAEA",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: RADIUS_PILL,
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
                borderRadius: RADIUS_PILL,
                padding: "6px 14px",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {r.label}
            </button>
          ))}
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.2)" }} />
          <button
            onClick={() => supabase.auth.signOut()}
            title="יציאה מהמערכת"
            style={{
              background: "transparent",
              color: "#8B90AD",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: RADIUS_PILL,
              padding: "6px 14px",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            יציאה
          </button>
        </div>
      </div>

      {!supportsFileSystemAccess && (
        <div className="no-print" style={{ background: "#FFF7E6", color: "#8A6116", fontSize: 12.5, padding: "8px 28px" }}>
          הדפדפן שלך לא תומך בזכירת קבצים אוטומטית — בכל רענון תתבקשו לבחור מחדש את הקובץ (אקסל או CSV).
          (נתמך ב-Chrome / Edge)
        </div>
      )}
      {excelLoader.status === "error" && (
        <div className="no-print" style={{ background: "#FDECEC", color: "#B23A34", fontSize: 12.5, padding: "8px 28px" }}>
          {excelLoader.errorMsg}
        </div>
      )}

      <div style={{ padding: "28px 28px 32px" }}>
        {cloudStatus === "loading" ? (
          <div
            style={{
              background: "#FFFFFF",
              border: `1px solid ${BORDER}`,
              borderRadius: RADIUS,
              padding: 40,
              textAlign: "center",
              color: "#6B7099",
            }}
          >
            טוען נתונים…
          </div>
        ) : cloudStatus === "error" ? (
          <div
            style={{
              background: "#FDECEC",
              border: `1px solid #F3C4C1`,
              borderRadius: RADIUS,
              padding: 40,
              textAlign: "center",
              color: "#B23A34",
            }}
          >
            שגיאה בטעינת הנתונים מהענן: {cloudError}
          </div>
        ) : weeks.length === 0 ? (
          <div
            style={{
              background: "#FFFFFF",
              border: `1px solid ${BORDER}`,
              borderRadius: RADIUS,
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
              className="print-avoid-break"
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
                      borderRadius: RADIUS,
                      padding: "16px 18px",
                      boxShadow: "0 4px 20px rgba(28,32,71,0.06)",
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
              className="print-avoid-break"
              style={{
                background: "#FFFFFF",
                border: `1px solid ${BORDER}`,
                borderRadius: RADIUS,
                padding: "20px 20px",
                marginBottom: 24,
                boxShadow: "0 4px 20px rgba(28,32,71,0.06)",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: NAVY }}>
                תצוגה לפי בחירה
              </div>
              <div style={{ fontSize: 12, color: "#8B90AD", marginBottom: 14 }}>
                בחרו תאריך בודד, או טווח תאריכים, לצפייה בנתונים היומיים
              </div>
              <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                <label style={{ fontSize: 12.5, color: "#6B7099", display: "flex", alignItems: "center", gap: 6 }}>
                  מתאריך
                  <input
                    type="date"
                    value={dailyFrom}
                    onChange={(e) => setDailyFrom(e.target.value)}
                    style={{ border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: "5px 8px", fontSize: 13 }}
                  />
                </label>
                <label style={{ fontSize: 12.5, color: "#6B7099", display: "flex", alignItems: "center", gap: 6 }}>
                  עד תאריך (אופציונלי)
                  <input
                    type="date"
                    value={dailyTo}
                    onChange={(e) => setDailyTo(e.target.value)}
                    style={{ border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: "5px 8px", fontSize: 13 }}
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
                      borderRadius: RADIUS,
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
                <div className="no-print" style={{ fontSize: 12.5, color: "#9498B5" }}>
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
                    {dailyKpis.map((k) => (
                      <div
                        key={k.key}
                        style={{
                          background: BG,
                          border: `1px solid ${BORDER}`,
                          borderRadius: RADIUS,
                          padding: "10px 14px",
                        }}
                      >
                        <div style={{ fontSize: 11.5, color: "#6B7099", marginBottom: 4, fontWeight: 600 }}>
                          {k.label}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>
                          {k.key === REVENUE_KEY
                            ? formatShekel(dailyResult.summary[k.key] || 0)
                            : dailyResult.summary[k.key] || 0}
                        </div>
                      </div>
                    ))}
                  </div>

                  {dailyResult.missingDates.length > 0 && (
                    <div style={{ fontSize: 12, color: "#B8860B", background: "#FFF7E6", padding: "8px 12px", borderRadius: RADIUS, marginBottom: 16 }}>
                      אין נתונים רשומים עבור: {dailyResult.missingDates.join(", ")} — ייתכן שלא הוזנו נתונים לתאריך זה
                      בקובץ (להבדיל מנתון אפס בפועל).
                    </div>
                  )}

                  <div className="print-table-wrap" style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 600 }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>תאריך</th>
                          {dailyMetricKeys.map((k) => (
                            <th key={k} style={thStyle}>
                              {dailyMetricLabels[k]}
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
                            {dailyMetricKeys.map((k) => (
                              <td key={k} style={tdStyle}>
                                {k === REVENUE_KEY && r.metrics[k] !== undefined
                                  ? formatShekel(r.metrics[k])
                                  : r.metrics[k] ?? "–"}
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

            {/* Monthly report */}
            <div
              className="no-print"
              style={{
                background: "#FFFFFF",
                border: `1px solid ${BORDER}`,
                borderRadius: RADIUS,
                padding: "20px 20px",
                marginBottom: 24,
                boxShadow: "0 4px 20px rgba(28,32,71,0.06)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>דוח חודשי</div>
                  <div style={{ fontSize: 12, color: "#8B90AD", marginTop: 2 }}>
                    סיכום מנהלים לחודש נבחר, כולל השוואה לחודש הקודם
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <select
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                    style={{
                      border: `1px solid ${BORDER}`,
                      borderRadius: RADIUS,
                      padding: "8px 12px",
                      fontSize: 13,
                      background: "#FFFFFF",
                      color: NAVY,
                      fontFamily: "inherit",
                    }}
                  >
                    {reportMonths.map((ym) => (
                      <option key={ym} value={ym}>
                        {formatMonthLabel(ym)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={exportMonthlyReport}
                    disabled={!report || reportExporting}
                    style={{
                      background: TEAL,
                      color: NAVY,
                      border: `1px solid ${TEAL}`,
                      borderRadius: RADIUS_PILL,
                      padding: "8px 16px",
                      fontSize: 13,
                      cursor: report && !reportExporting ? "pointer" : "not-allowed",
                      fontWeight: 700,
                    }}
                  >
                    {reportExporting ? "מייצא…" : "ייצוא דוח חודשי"}
                  </button>
                </div>
              </div>

              {!report ? (
                <div style={{ fontSize: 12.5, color: "#9498B5" }}>אין עדיין נתונים ליצירת דוח חודשי.</div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 12,
                  }}
                >
                  {kpis.map((k) => {
                    const curr = report.metrics[k.key] || 0;
                    const before = report.prevMetrics[k.key] || 0;
                    return (
                      <div
                        key={k.key}
                        style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: "12px 14px" }}
                      >
                        <div style={{ fontSize: 11.5, color: "#6B7099", marginBottom: 4, fontWeight: 600 }}>{k.label}</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>{curr}</span>
                          <Delta value={pctChange(curr, before)} />
                        </div>
                      </div>
                    );
                  })}
                  <div
                    style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: "12px 14px" }}
                  >
                    <div style={{ fontSize: 11.5, color: "#6B7099", marginBottom: 4, fontWeight: 600 }}>הכנסות</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>{formatShekel(report.revenue)}</span>
                      <Delta value={pctChange(report.revenue, report.prevRevenue)} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Revenue */}
            <div
              className="print-avoid-break"
              style={{
                background: "#FFFFFF",
                border: `1px solid ${BORDER}`,
                borderRadius: RADIUS,
                padding: "20px 20px 8px",
                marginBottom: 24,
                boxShadow: "0 4px 20px rgba(28,32,71,0.06)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 4,
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>הכנסות</div>
                  <div style={{ fontSize: 12, color: "#8B90AD", marginTop: 2 }}>
                    מתוך דוח ריכוז מסמכים · "חשבונית מס קבלה" בלבד
                    {revenue?.fileName ? ` · ${revenue.fileName}` : ""}
                    {revenue?.lastLoaded ? ` · עודכן ${formatTimestamp(revenue.lastLoaded)}` : ""}
                  </div>
                </div>
                <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {revenueDays.length > 0 && (
                    <button
                      onClick={revenueLoader.refresh}
                      disabled={revenueLoader.status === "loading"}
                      style={{
                        background: TEAL,
                        color: NAVY,
                        border: `1px solid ${TEAL}`,
                        borderRadius: RADIUS_PILL,
                        padding: "5px 12px",
                        fontSize: 12.5,
                        cursor: revenueLoader.status === "loading" ? "wait" : "pointer",
                        fontWeight: 700,
                      }}
                    >
                      {revenueLoader.status === "loading" ? "טוען…" : "רענן הכנסות"}
                    </button>
                  )}
                  <button
                    onClick={revenueLoader.pickFile}
                    style={{
                      background: "transparent",
                      color: NAVY,
                      border: `1px solid ${BORDER}`,
                      borderRadius: RADIUS_PILL,
                      padding: "5px 12px",
                      fontSize: 12.5,
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    בחר קובץ הכנסות (CSV)…
                  </button>
                </div>
              </div>

              {revenueLoader.status === "error" && (
                <div style={{ fontSize: 12.5, color: "#B23A34", marginBottom: 12 }}>{revenueLoader.errorMsg}</div>
              )}

              {revenueDays.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "#9498B5", padding: "12px 0" }}>
                  טרם נטען קובץ הכנסות. לחצו "בחר קובץ הכנסות (CSV)…" כדי לטעון את דוח ריכוז המסמכים.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                      gap: 14,
                      margin: "14px 0 20px",
                    }}
                  >
                    <div
                      style={{
                        background: "#FFFFFF",
                        border: `1px solid ${BORDER}`,
                        borderTop: `3px solid ${TEAL}`,
                        borderRadius: RADIUS,
                        padding: "16px 18px",
                        boxShadow: "0 4px 20px rgba(28,32,71,0.06)",
                      }}
                    >
                      <div style={{ fontSize: 12.5, color: "#6B7099", marginBottom: 8, fontWeight: 600 }}>
                        הכנסות · שבוע אחרון ({latestRevenueWeek?.label})
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                        <span style={{ fontSize: 26, fontWeight: 700, color: NAVY }}>
                          {formatShekel(latestRevenueWeek?.revenue)}
                          <span style={{ fontSize: 16, color: "#9498B5" }}>*</span>
                        </span>
                        <Delta value={pctChange(latestRevenueWeek?.revenue, prevRevenueWeek?.revenue)} />
                      </div>
                      <div style={{ fontSize: 11, color: "#9498B5", marginTop: 4 }}>
                        שבוע קודם: {formatShekel(prevRevenueWeek?.revenue)}
                      </div>
                      <div style={{ fontSize: 10.5, color: "#B3B7CC", marginTop: 6 }}>* לחודש זה</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>הכנסות שבועיות</div>
                    <div className="no-print" style={{ display: "flex", gap: 6 }}>
                      {[
                        { id: "12w", label: "12 שבועות אחרונים" },
                        { id: "all", label: "הכל" },
                      ].map((r) => (
                        <button
                          key={r.id}
                          onClick={() => setRevenueRange(r.id)}
                          style={{
                            background: revenueRange === r.id ? TEAL : "transparent",
                            color: NAVY,
                            border: `1px solid ${revenueRange === r.id ? TEAL : BORDER}`,
                            borderRadius: RADIUS_PILL,
                            padding: "4px 10px",
                            fontSize: 11.5,
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div ref={weeklyRevenueChartRef}>
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={revenueChartData} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                        <XAxis dataKey="label" tick={{ fill: "#8B90AD", fontSize: 10.5 }} />
                        <YAxis tick={{ fill: "#8B90AD", fontSize: 11 }} tickFormatter={formatShekelShort} />
                        <Tooltip
                          contentStyle={{ background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: RADIUS, fontSize: 12 }}
                          labelStyle={{ color: NAVY, fontWeight: 700 }}
                          formatter={(v) => formatShekel(v)}
                        />
                        <Bar dataKey="revenue" name="הכנסות" fill={TEAL} radius={[3, 3, 0, 0]}>
                          <LabelList
                            dataKey="revenue"
                            position="top"
                            formatter={formatShekelShort}
                            style={{ fill: NAVY, fontSize: 10.5, fontWeight: 700 }}
                          />
                        </Bar>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: "20px 0 4px" }}>
                    הכנסות חודשיות
                  </div>
                  <div ref={monthlyRevenueChartRef}>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={monthlyRevenueData} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                        <XAxis dataKey="label" tick={{ fill: "#8B90AD", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#8B90AD", fontSize: 11 }} tickFormatter={formatShekelShort} />
                        <Tooltip
                          contentStyle={{ background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: RADIUS, fontSize: 12 }}
                          labelStyle={{ color: NAVY, fontWeight: 700 }}
                          formatter={(v) => formatShekel(v)}
                        />
                        <Bar dataKey="revenue" name="הכנסות" fill={NAVY} radius={[3, 3, 0, 0]}>
                          <LabelList
                            dataKey="revenue"
                            position="top"
                            formatter={formatShekelShort}
                            style={{ fill: NAVY, fontSize: 11, fontWeight: 700 }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>

            {/* Funnel trend chart */}
            <div
              className="print-avoid-break"
              style={{
                background: "#FFFFFF",
                border: `1px solid ${BORDER}`,
                borderRadius: RADIUS,
                padding: "20px 20px 8px",
                marginBottom: 24,
                boxShadow: "0 4px 20px rgba(28,32,71,0.06)",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: NAVY }}>
                מגמת המשפך השבועית
              </div>
              <div style={{ fontSize: 12, color: "#8B90AD", marginBottom: 12 }}>
                כניסות → הרשמות לאתר → הצעות מחיר → הזמנות
              </div>
              <div ref={funnelTrendChartRef}>
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="week" tick={{ fill: "#8B90AD", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#8B90AD", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: RADIUS, fontSize: 12 }}
                      labelStyle={{ color: NAVY, fontWeight: 700 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="כניסות לדף נחיתה" fill="#DDE1EE" radius={[3, 3, 0, 0]} />
                    <Line type="monotone" dataKey="הרשמות לאתר" stroke={NAVY} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="הצעות מחיר" stroke="#8B90AD" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="הזמנות" stroke={TEAL} strokeWidth={3} dot={{ r: 3, fill: TEAL }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Monthly closed-orders summary */}
            <div
              className="print-avoid-break"
              style={{
                background: "#FFFFFF",
                border: `1px solid ${BORDER}`,
                borderRadius: RADIUS,
                padding: "20px 20px 8px",
                marginBottom: 24,
                boxShadow: "0 4px 20px rgba(28,32,71,0.06)",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: NAVY }}>
                סה״כ הזמנות שנסגרו לפי חודש
              </div>
              <div style={{ fontSize: 12, color: "#8B90AD", marginBottom: 12 }}>
                סכום "הזמנות ממכרזים" מכל השבועות בכל חודש
              </div>
              <div ref={monthlyClosedOrdersChartRef}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyClosedOrders} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="month" tick={{ fill: "#8B90AD", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#8B90AD", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: RADIUS, fontSize: 12 }}
                      labelStyle={{ color: NAVY, fontWeight: 700 }}
                    />
                    <Bar dataKey="total" name="הזמנות" fill={TEAL} radius={[3, 3, 0, 0]}>
                      <LabelList dataKey="total" position="top" style={{ fill: NAVY, fontSize: 12, fontWeight: 700 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Conversion rates (only weeks that have this data) */}
            {rateData.length > 0 && (
              <div
                className="print-avoid-break"
                style={{
                  background: "#FFFFFF",
                  border: `1px solid ${BORDER}`,
                  borderRadius: RADIUS,
                  padding: "20px 20px 8px",
                  marginBottom: 24,
                  boxShadow: "0 4px 20px rgba(28,32,71,0.06)",
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: NAVY }}>
                  אחוזי המרה
                </div>
                <div style={{ fontSize: 12, color: "#8B90AD", marginBottom: 12 }}>
                  החל מהמעקב שהתווסף באמצע יוני
                </div>
                <div ref={conversionRatesChartRef}>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={rateData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                      <XAxis dataKey="week" tick={{ fill: "#8B90AD", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#8B90AD", fontSize: 11 }} unit="%" />
                      <Tooltip
                        contentStyle={{ background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: RADIUS, fontSize: 12 }}
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
              </div>
            )}

            {/* Full data table */}
            <div
              style={{
                background: "#FFFFFF",
                border: `1px solid ${BORDER}`,
                borderRadius: RADIUS,
                padding: 20,
                marginBottom: 12,
                boxShadow: "0 4px 20px rgba(28,32,71,0.06)",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: NAVY }}>
                פירוט שבועי מלא
              </div>
              <div className="print-table-wrap" style={{ overflowX: "auto" }}>
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
