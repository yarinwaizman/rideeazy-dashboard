import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, pdf } from "@react-pdf/renderer";
import { registerFonts } from "./fonts.js";
import { formatShekel, pctChange } from "../format.js";
import logo from "../../assets/rideeazy-logo.png";

// Intl.NumberFormat (he-IL currency) embeds invisible bidi control marks
// (U+200E/U+200F etc.) around the symbol/digits. react-pdf's font-shaping
// engine has no glyph for them and mishandles them badly: not just a
// missing/garbled glyph, but a wrong-width measurement that corrupts layout
// of *later* siblings too (e.g. a table after the text silently vanishing).
// Strip them from any locale-formatted string before it reaches a <Text>.
const BIDI_CONTROL_CHARS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
function stripBidi(str) {
  return String(str).replace(BIDI_CONTROL_CHARS, "");
}

const NAVY = "#1C2047";
const TEAL = "#51DFD7";
const BORDER = "#E7E9EF";
const MUTED = "#6B7099";
const FAINT = "#9498B5";
const UP = "#1F9E76";
const DOWN = "#D5504A";

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "Rubik", direction: "rtl", color: NAVY, fontSize: 11 },
  headerRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 },
  logo: { width: 75, height: 30, marginBottom: 10 },
  title: { fontSize: 20, fontWeight: 700, textAlign: "right" },
  subtitle: { fontSize: 10.5, color: MUTED, textAlign: "right", marginTop: 4 },
  cardsRow: { flexDirection: "row-reverse", flexWrap: "wrap", marginBottom: 22 },
  card: {
    width: 170,
    borderWidth: 1,
    borderColor: BORDER,
    borderTopWidth: 3,
    borderTopColor: TEAL,
    borderRadius: 6,
    padding: 10,
    marginLeft: 12,
    marginBottom: 12,
  },
  cardLabel: { fontSize: 9.5, color: MUTED, fontWeight: 500, marginBottom: 6, textAlign: "right" },
  cardValueRow: { flexDirection: "row-reverse", alignItems: "baseline" },
  cardValue: { fontSize: 16, fontWeight: 700, textAlign: "right" },
  cardDelta: { fontSize: 9.5, fontWeight: 700, marginRight: 6 },
  cardPrev: { fontSize: 9, color: FAINT, marginTop: 4, textAlign: "right" },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 6 },
  tHeadRow: { flexDirection: "row-reverse", borderBottomWidth: 2, borderBottomColor: NAVY },
  tRow: { flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: BORDER },
  tRowAlt: { backgroundColor: "#F7F8FB" },
  thLabel: { width: 260, padding: 8, fontSize: 10.5, fontWeight: 700, color: MUTED, textAlign: "right" },
  th: { width: 170, padding: 8, fontSize: 10.5, fontWeight: 700, color: MUTED, textAlign: "center" },
  tdLabel: { width: 260, padding: 8, fontSize: 10.5, fontWeight: 700, textAlign: "right" },
  td: { width: 170, padding: 8, fontSize: 10.5, textAlign: "center" },
});

function delta(curr, before) {
  const value = pctChange(curr, before);
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { text: "—", color: FAINT };
  }
  const up = value >= 0;
  return { text: `${up ? "+" : "-"}${Math.abs(value).toFixed(0)}%`, color: up ? UP : DOWN };
}

function reportRows(report, kpis, revenueKey) {
  return [...kpis, { key: revenueKey, label: "הכנסות" }].map((k) => {
    const isRevenue = k.key === revenueKey;
    const curr = isRevenue ? report.revenue : report.metrics[k.key] || 0;
    const before = isRevenue ? report.prevRevenue : report.prevMetrics[k.key] || 0;
    return {
      key: k.key,
      label: k.label,
      currDisplay: isRevenue ? stripBidi(formatShekel(curr)) : String(curr),
      beforeDisplay: isRevenue ? stripBidi(formatShekel(before)) : String(before),
      delta: delta(curr, before),
    };
  });
}

function MonthlyReportDocument({ report, kpis, revenueKey, producedAt }) {
  const rows = reportRows(report, kpis, revenueKey);
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Image src={logo} style={styles.logo} />
            <Text style={styles.title}>דוח חודשי — {report.label}</Text>
            <Text style={styles.subtitle}>
              בהשוואה ל{report.prevLabel} · תאריך הפקה: {producedAt}
            </Text>
          </View>
        </View>

        <View style={styles.cardsRow}>
          {rows.map((r) => (
            <View key={r.key} style={styles.card}>
              <Text style={styles.cardLabel}>{r.label}</Text>
              <View style={styles.cardValueRow}>
                <Text style={styles.cardValue}>{r.currDisplay}</Text>
                <Text style={[styles.cardDelta, { color: r.delta.color }]}>{r.delta.text}</Text>
              </View>
              <Text style={styles.cardPrev}>
                {report.prevLabel}: {r.beforeDisplay}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.table}>
          <View style={styles.tHeadRow}>
            <Text style={styles.thLabel}>מדד</Text>
            <Text style={styles.th}>{report.label}</Text>
            <Text style={styles.th}>{report.prevLabel}</Text>
            <Text style={styles.th}>שינוי</Text>
          </View>
          {rows.map((r, i) => (
            <View key={r.key} style={[styles.tRow, i % 2 === 1 ? styles.tRowAlt : null]}>
              <Text style={styles.tdLabel}>{r.label}</Text>
              <Text style={styles.td}>{r.currDisplay}</Text>
              <Text style={styles.td}>{r.beforeDisplay}</Text>
              <Text style={[styles.td, { color: r.delta.color, fontWeight: 700 }]}>{r.delta.text}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export async function buildMonthlyReportPdfBlob({ report, kpis, revenueKey }) {
  registerFonts();
  const producedAt = stripBidi(
    new Date().toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  );
  return pdf(
    <MonthlyReportDocument report={report} kpis={kpis} revenueKey={revenueKey} producedAt={producedAt} />
  ).toBlob();
}

export async function downloadMonthlyReportPdf({ report, kpis, revenueKey }) {
  const blob = await buildMonthlyReportPdfBlob({ report, kpis, revenueKey });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `דוח-חודשי-${report.ym}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
