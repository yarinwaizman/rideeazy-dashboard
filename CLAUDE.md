# Rideeazy Weekly Status Dashboard

A single-page React dashboard (Hebrew, RTL) that visualizes Rideeazy's weekly
operational funnel (landing page visits → signups → quotes → closed orders)
and revenue. It's a static site: no backend server, no build-time secrets.
Data lives in Supabase (Postgres) and is uploaded by pasting local Excel/CSV
exports through the UI.

## Stack

- React 18 (no router, no state library — just `useState`/`useMemo` in one component)
- Vite 5 build tooling
- Recharts for charts, `xlsx` (SheetJS) for parsing the ops workbook, `papaparse` for the revenue CSV
- Supabase (`@supabase/supabase-js`) for auth + data storage
- `@react-pdf/renderer` for both PDF exports (true text-based PDFs, not browser print)
- Deployed as a static build to GitHub Pages

## Commands

```
npm run dev       # vite dev server, http://localhost:5173
npm run build     # production build to dist/ (base path /rideeazy-dashboard/)
npm run preview   # serve the production build locally
```

No test suite, linter, or type checker is configured. There is no `.env` —
the Supabase URL and publishable key are hardcoded in `src/lib/supabaseClient.js`
(see "Auth model" below for why that's safe).

## Architecture

```
src/
  main.jsx              — mounts <PasswordGate><Dashboard /></PasswordGate>
  PasswordGate.jsx       — password form that signs into shared Supabase auth account
  Dashboard.jsx          — the entire app UI: KPIs, daily view, revenue, funnel/rate charts, full table
  lib/
    supabaseClient.js     — Supabase client + shared login email constant
    datasets.js           — fetch/save the two dataset rows ('ops', 'revenue') in Supabase
    parseWorkbook.js       — parses the ops Excel export into weeks/days
    parseRevenue.js        — parses the EZcount revenue CSV export into days/weeks/months
    fileHandle.js          — IndexedDB-backed FileSystemFileHandle persistence (Chrome/Edge "remember this file")
    useLoadableFile.js      — shared hook wiring together: pick file → parse → persist to Supabase → update state
    format.js              — shared formatters (formatShekel, pctChange, formatTimestamp) used by both the UI and the PDF exports
    monthlyReport.js        — MoM summary data (available months, current vs. previous month totals)
    pdf/
      fonts.js              — registers the Rubik TTF files with @react-pdf/renderer (must be static-weight files, not a variable font — see below)
      captureChart.js        — rasterizes a live Recharts <svg> to a PNG data URL (react-pdf can't render Recharts directly)
      MonthlyReportPdf.jsx    — builds/downloads the one-month MoM PDF report
      DashboardPdf.jsx        — builds/downloads the full dashboard PDF (KPIs + one chart image per page + full data table)
supabase/
  schema.sql             — the `datasets` table + RLS policies (reference copy; already applied live)
.github/workflows/deploy.yml — build + deploy to GitHub Pages on push to main
```

There are only two React components. `Dashboard.jsx` is intentionally one
large file — resist the urge to split it into many small components unless
asked; the existing style favors inline `style={{...}}` objects over CSS
modules/Tailwind/styled-components.

## Data flow

1. Someone clicks "בחר קובץ אקסל…" (pick Excel file) or "בחר קובץ הכנסות" (pick revenue CSV).
2. `useLoadableFile` opens a file picker (native `showOpenFilePicker` on Chrome/Edge, falls back to a hidden `<input type=file>` elsewhere), remembers the handle in IndexedDB via `fileHandle.js` so "רענן נתונים" (refresh) can silently re-read the same file later without re-browsing.
3. The file is parsed client-side (`parseWorkbook.js` for the ops `.xlsx`, `parseRevenue.js` for the CSV) into plain JSON.
4. The parsed payload is upserted into Supabase's `datasets` table (`saveDataset` in `datasets.js`) under a fixed row id (`"ops"` or `"revenue"`), then local component state is updated.
5. On every load, `fetchDatasets()` pulls both rows from Supabase — this is the single source of truth shared across every device/browser that logs in. Uploading from one machine updates the dashboard for everyone.

There is no server-side processing — all Excel/CSV parsing happens in the
browser before the JSON payload is sent to Supabase.

## Auth model

- Real access control, not just a UI gate: Supabase RLS policies on
  `public.datasets` only permit the `authenticated` role, so the anon/public
  key (hardcoded in the bundle) can read nothing on its own.
- The password form (`PasswordGate.jsx`) signs into **one shared Supabase
  account** (`dashboard@rideeazy.co.il`, see `SHARED_EMAIL`) using
  `signInWithPassword` — the user only types a password, the email is fixed.
- Signing out (top-right "יציאה" button) calls `supabase.auth.signOut()`.
- Because the publishable key only grants what RLS allows, it's fine that
  it's committed in `supabaseClient.js` — don't treat this as a secret leak
  and don't try to move it to an env var; there's no secret-management story
  for a GitHub Pages static site anyway.

## Domain quirks worth knowing before touching parsing code

These are all non-obvious and encoded as comments in the source — read them
before changing parsing logic:

- **`parseWorkbook.js`**: one sheet per month (`"<חודש> - שבועי"`), each with
  several week-blocks (date-range header row → day-of-week row → metric
  rows). Category names drift between months (e.g. "הצעות מחיר" vs "הצעות
  מחיר באתר"), handled via `METRIC_ALIASES`/`RATE_ALIASES` lookup tables
  rather than exact string matches — if a new month introduces a new label
  variant, add it there.
- Column 6 (Fri+Sat) is a combined "weekend" value with no way to split it —
  it becomes one day-record spanning both dates.
- A day record's `month` comes from its own date, not its sheet-of-origin,
  since a week block can span two calendar months.
- Placeholder/future weeks (not yet started) and stale all-zero template
  blocks are filtered out, except the single most-recent week (which is kept
  even if all-zero, since that just means it hasn't been filled in yet).
- **`parseRevenue.js`**: only rows where `סוג מסמך` (document type) is
  `"חשבונית מס קבלה"` (tax invoice/receipt) count as revenue — other document
  types (quotes, credit notes) are ignored. Revenue is bucketed into Sun–Sat
  weeks independently of the ops workbook's own week blocks, since the
  revenue export covers a much wider date range.
- **`mergeRevenueIntoDays`**: folds revenue into ops day-records by date match
  (including matching either side of the combined weekend record); days with
  revenue but no ops record become new standalone entries.

## Conventions

- All UI copy is in Hebrew; the whole app renders `dir="rtl"`. Keep new UI
  text in Hebrew and RTL-safe.
- Inline styles, not CSS modules — colors are hardcoded local constants
  (`NAVY`, `TEAL`, `BORDER`, `BG`) matching the palette pulled from
  `app.rideeazy.co.il`; reuse these rather than introducing new colors.
- Currency formatting always via the shared `Intl.NumberFormat('he-IL', ...)`
  helpers (`formatShekel`, `formatShekelShort`) in `lib/format.js`.
- Both PDF exports ("ייצוא ל-PDF" and "ייצוא דוח חודשי") build a true
  text-based PDF with `@react-pdf/renderer` — **not** `window.print()`.
  That approach was tried first and abandoned: browser print engines proved
  unreliable across scale/orientation settings in ways that couldn't be
  fixed with CSS, and unlike CSS-based printing, react-pdf output can
  actually be generated and inspected headlessly (`pdf(doc).toBlob()` +
  reading the file), which is how these exports were verified.
  - `MonthlyReportPdf.jsx` and `DashboardPdf.jsx` each export a
    `download*Pdf(...)` function called directly from the dashboard's
    export buttons.
  - **Bidi gotcha**: `Intl.NumberFormat('he-IL', { style: 'currency', ... })`
    embeds invisible RLM/LRM bidi-control characters (U+200E/U+200F etc.)
    around the currency symbol. react-pdf's font-shaping engine has no
    glyph for them and doesn't just render them oddly — it can silently
    corrupt the layout of *later* siblings too (an entire table rendered
    after the corrupted text can vanish with no error thrown). Always run
    locale-formatted strings through `stripBidi()` (defined in both PDF
    files) before passing them to a react-pdf `<Text>`.
  - Charts aren't real react-pdf elements — react-pdf can't render Recharts
    directly. `captureChart.js` rasterizes the *live* Recharts `<svg>` (via
    a DOM ref on each chart's wrapping div) to a PNG, which is then embedded
    as a react-pdf `<Image>`. Recharts renders its `<Legend>` as a separate
    HTML element beside the `<svg>`, not inside it, so it's dropped by this
    rasterization — charts that need a legend pass one manually (label +
    color per series) and `DashboardPdf.jsx` renders it as real PDF text
    above the chart image instead.
  - The `Rubik-*.ttf` files in `src/assets/fonts/` must stay static-weight
    instances (Regular/Medium/Bold), not a variable font — react-pdf's
    fontkit-based layout engine doesn't reliably handle variable fonts.
- No abstractions beyond what's needed — this is a small internal tool, not
  a product with many consumers. Prefer keeping logic in the existing files
  over introducing new layers.

## Deployment

Push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) builds with
`npm ci && npm run build` and deploys `dist/` to GitHub Pages. No manual
deploy step. `vite.config.js` sets `base: "/rideeazy-dashboard/"` only for
the production build (dev stays at `/`), so don't hardcode that path
elsewhere.

## Supabase changes

`supabase/schema.sql` is a reference copy of what's already applied to the
live project (not run automatically by any tooling here) — if you change the
`datasets` table or its RLS policies, update this file to match and apply the
change manually via the Supabase SQL editor.
