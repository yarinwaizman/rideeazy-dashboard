// Reads the live Excel + revenue CSV straight off disk (Node has no browser
// sandbox restrictions) and writes a snapshot into src/seedData.json, which
// the app ships as its default view for anyone who doesn't load their own
// files. Run this, then build + push, whenever you want to publish fresh
// numbers.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { parseWorkbook } from "../src/lib/parseWorkbook.js";
import { parseRevenueCsv } from "../src/lib/parseRevenue.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "local.config.json");

if (!fs.existsSync(configPath)) {
  console.error(
    `Missing ${configPath}\nCopy scripts/local.config.example.json to scripts/local.config.json and set xlsxPath.`
  );
  process.exit(1);
}

const { xlsxPath, csvPath } = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const buf = fs.readFileSync(xlsxPath);
const workbook = XLSX.read(buf, { type: "buffer", cellDates: true });
const { weeks, days } = parseWorkbook(workbook);

const seed = { weeks, days, fileName: path.basename(xlsxPath), lastLoaded: new Date().toISOString() };

if (csvPath && fs.existsSync(csvPath)) {
  const csvText = fs.readFileSync(csvPath, "utf-8");
  seed.revenueDays = parseRevenueCsv(csvText);
  seed.revenueFileName = path.basename(csvPath);
  seed.revenueLastLoaded = new Date().toISOString();
  console.log(`Included ${seed.revenueDays.length} revenue-day records from ${csvPath}`);
} else if (csvPath) {
  console.warn(`csvPath is set but not found: ${csvPath} — skipping revenue in this seed.`);
} else {
  console.log("No csvPath configured — skipping revenue in this seed.");
}

const outPath = path.join(__dirname, "../src/seedData.json");
fs.writeFileSync(outPath, JSON.stringify(seed, null, 2));

console.log(`Wrote ${weeks.length} weeks and ${days.length} day records to ${outPath}`);
