import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, pdf } from "@react-pdf/renderer";
import { registerFonts } from "./fonts.js";
import { pctChange } from "../format.js";
import logo from "../../assets/rideeazy-logo.png";

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

const CHART_DISPLAY_WIDTH = 750;

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "Rubik", direction: "rtl", color: NAVY, fontSize: 11 },
  headerRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 },
  logo: { width: 75, height: 30, marginBottom: 10 },
  title: { fontSize: 20, fontWeight: 700, textAlign: "right" },
  subtitle: { fontSize: 10.5, color: MUTED, textAlign: "right", marginTop: 4 },
  cardsRow: { flexDirection: "row-reverse", flexWrap: "wrap", marginBottom: 10 },
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
  chartTitle: { fontSize: 14, fontWeight: 700, marginBottom: 4, textAlign: "right" },
  chartImage: { width: CHART_DISPLAY_WIDTH },
  legendRow: { flexDirection: "row-reverse", flexWrap: "wrap", marginBottom: 10 },
  legendItem: { flexDirection: "row-reverse", alignItems: "center", marginLeft: 16 },
  legendSwatch: { width: 9, height: 9, borderRadius: 2, marginLeft: 5 },
  legendLabel: { fontSize: 9.5, color: MUTED },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 6 },
  tHeadRow: { flexDirection: "row-reverse", borderBottomWidth: 2, borderBottomColor: NAVY, backgroundColor: "#FFFFFF" },
  tRow: { flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: BORDER },
  tRowAlt: { backgroundColor: "#F7F8FB" },
  thWeek: { width: 110, padding: 6, fontSize: 9, fontWeight: 700, color: MUTED, textAlign: "center" },
  th: { flex: 1, padding: 6, fontSize: 8.5, fontWeight: 700, color: MUTED, textAlign: "center" },
  tdWeek: { width: 110, padding: 6, fontSize: 9, fontWeight: 700, textAlign: "center" },
  td: { flex: 1, padding: 6, fontSize: 9, textAlign: "center" },
});

function delta(curr, before) {
  const value = pctChange(curr, before);
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { text: "—", color: FAINT };
  }
  const up = value >= 0;
  return { text: `${up ? "+" : "-"}${Math.abs(value).toFixed(0)}%`, color: up ? UP : DOWN };
}

function ChartLegend({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <View style={styles.legendRow}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: item.color }]} />
          <Text style={styles.legendLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function HeaderBlock({ subtitle }) {
  return (
    <View style={styles.headerRow}>
      <View>
        <Image src={logo} style={styles.logo} />
        <Text style={styles.title}>דוח סטטוס תפעולי</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function DashboardDocument({ subtitle, kpis, tableColumns, tableRows, charts }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <HeaderBlock subtitle={subtitle} />
        <View style={styles.cardsRow}>
          {kpis.map((k) => {
            const d = delta(k.curr, k.before);
            return (
              <View key={k.label} style={styles.card}>
                <Text style={styles.cardLabel}>{k.label}</Text>
                <View style={styles.cardValueRow}>
                  <Text style={styles.cardValue}>{k.curr}</Text>
                  <Text style={[styles.cardDelta, { color: d.color }]}>{d.text}</Text>
                </View>
                <Text style={styles.cardPrev}>שבוע קודם: {k.before}</Text>
              </View>
            );
          })}
        </View>
      </Page>

      {charts.map(
        (chart) =>
          chart && (
            <Page key={chart.title} size="A4" orientation="landscape" style={styles.page}>
              <Text style={styles.chartTitle}>{chart.title}</Text>
              <ChartLegend items={chart.legend} />
              <Image
                src={chart.dataUrl}
                style={[styles.chartImage, { height: CHART_DISPLAY_WIDTH * (chart.height / chart.width) }]}
              />
            </Page>
          )
      )}

      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <Text style={styles.chartTitle}>פירוט שבועי מלא</Text>
        <View style={styles.table}>
          <View style={styles.tHeadRow} fixed>
            <Text style={styles.thWeek}>שבוע</Text>
            {tableColumns.map((label) => (
              <Text key={label} style={styles.th}>
                {label}
              </Text>
            ))}
          </View>
          {tableRows.map((row, i) => (
            <View key={row.week + i} style={[styles.tRow, i % 2 === 1 ? styles.tRowAlt : null]} wrap={false}>
              <Text style={styles.tdWeek}>{row.week}</Text>
              {row.values.map((v, j) => (
                <Text key={j} style={styles.td}>
                  {v}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export async function buildDashboardPdfBlob({ subtitle, kpis, tableColumns, tableRows, charts }) {
  registerFonts();
  const doc = (
    <DashboardDocument
      subtitle={stripBidi(subtitle)}
      kpis={kpis}
      tableColumns={tableColumns}
      tableRows={tableRows}
      charts={charts}
    />
  );
  return pdf(doc).toBlob();
}

export async function downloadDashboardPdf(args) {
  const blob = await buildDashboardPdfBlob(args);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "דוח-סטטוס-תפעולי.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
