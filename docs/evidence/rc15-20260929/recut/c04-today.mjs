// The committed C04 extract (scripts/time-scale-sources/eopc04-1972.txt)
// against eopc04.1962-now as IERS serves it on the day this runs. IERS
// replaces the file every day, so its digest is not the pinned one of
// 2026-09-28; this checks only that the header lines and the 367 rows of 1972
// that the extract holds are still the ones IERS serves.
//
//   curl -sS -o eopc04.1962-now https://hpiers.obspm.fr/iers/eop/eopc04/eopc04.1962-now
//   node c04-today.mjs eopc04.1962-now
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { C04, c04RowsText, readSources } from "../../../../scripts/build-time-scales.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const bytes = readFileSync(process.argv[2]);
const committed = readSources(root).c04Text;
const today = c04RowsText(bytes.toString("latin1"));
const split = (text) => {
  const lines = text.trimEnd().split("\n");
  return { header: lines.filter((line) => line.startsWith("#")), rows: lines.filter((line) => !line.startsWith("#")) };
};
const [a, b] = [split(committed), split(today)];
const sameRows = a.rows.length === b.rows.length && a.rows.every((row, k) => row === b.rows[k]);
const sameHeader = a.header.length === b.header.length && a.header.every((line, k) => line === b.header[k]);
console.log(
  `today's file: ${bytes.length} bytes, sha256 ${createHash("sha256").update(bytes).digest("hex")} ` +
    `(the pinned file of 2026-09-28: sha256 ${C04.sha256})`
);
console.log(`rows of 1972-01-01 to 1973-01-01 (MJD ${C04.from} to ${C04.to}): ${b.rows.length}, ${sameRows ? "identical to" : "DIFFERENT FROM"} the ${a.rows.length} committed`);
console.log(`header lines: ${b.header.length}, ${sameHeader ? "identical to" : "different from"} the ${a.header.length} committed`);
process.exit(sameRows ? 0 : 1);
