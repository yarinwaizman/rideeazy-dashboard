// Reads the live Excel file straight off disk (Node has no browser sandbox
// restrictions) and writes a snapshot into src/seedData.json, which the app
// ships as its default view for anyone who doesn't load their own file.
// Run this, then build + push, whenever you want to publish fresh numbers.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { parseWorkbook } from "../src/lib/parseWorkbook.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "local.config.json");

if (!fs.existsSync(configPath)) {
  console.error(
    `Missing ${configPath}\nCopy scripts/local.config.example.json to scripts/local.config.json and set xlsxPath.`
  );
  process.exit(1);
}

const { xlsxPath } = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const buf = fs.readFileSync(xlsxPath);
const workbook = XLSX.read(buf, { type: "buffer", cellDates: true });
const { weeks, days } = parseWorkbook(workbook);

const outPath = path.join(__dirname, "../src/seedData.json");
fs.writeFileSync(
  outPath,
  JSON.stringify(
    { weeks, days, fileName: path.basename(xlsxPath), lastLoaded: new Date().toISOString() },
    null,
    2
  )
);

console.log(`Wrote ${weeks.length} weeks and ${days.length} day records to ${outPath}`);
