/*
 * Builds src/time-scale-data.ts: the leap-second list and the UT1 - UTC table
 * the engine uses to turn UTC into TT and UT1.
 *
 * Its inputs are committed in scripts/time-scale-sources/, so that
 * `node scripts/build-time-scales.mjs --check` runs from a checkout alone:
 *
 * - leap-seconds.list: the IERS leap-second list, byte for byte as IERS serves
 *   it at LEAP_SECONDS.url (retrieved 2026-09-29, Last-Modified
 *   2026-07-06T07:54:11Z), "in the public domain" by its own header. It is
 *   checked against its own SHA-1 line (#h) and the SHA-256 below, and its last
 *   update (#$) and expiry (#@) are recorded.
 * - eopc04-1972.txt: the six header lines and the 367 rows from 1972-01-01 to
 *   1973-01-01 (MJD 41317 to 41683) of the IERS EOP 20 C04 series,
 *   eopc04.1962-now, byte for byte as IERS served it at C04.url (retrieved
 *   2026-09-29, Last-Modified 2026-09-28T13:21:06Z). finals2000A.all begins on
 *   1973-01-02, so 1972 comes from C04.
 * - finals2000A-20260924-ut1.csv.gz: MJD, date, flag (I observed, P
 *   predicted), UT1 - UTC and its formal error, s, of every row of IERS
 *   finals2000A.all (Bulletin A) of 2026-09-24 that has a UT1 - UTC value, as
 *   the file gives them (7 decimals). That file is the one the ΔT table
 *   (src/deltat.ts) was built from. Its URL always serves the latest day's
 *   file, and the whole file (3.8 MB) is not committed, only these rows.
 *
 * IERS_FINALS and IERS_C04 may name copies of the whole files. Their SHA-256
 * must match the pinned ones, and the script then checks (--check) or rewrites
 * the committed rows from them.
 *
 * The table holds UT1 - TAI, which runs continuously through leap seconds, in
 * whole milliseconds: on the first day, then every third day on the grid of
 * the finals2000A rows (so the join of C04 and finals2000A on 1973-01-02 is a
 * knot), then on the last row. The knots after the first are packed as second
 * differences, two to a character; the engine adds TAI - UTC back and
 * interpolates linearly between knots, which is continuous across the join.
 * The interpolation reproduces every daily value it was built from, C04's and
 * finals2000A's, within `bound` seconds (measured here, and checked by the
 * tests against both sets of rows). Formal errors are kept as the largest of
 * the C04 rows, the largest observed one of each year of finals2000A, and the
 * prediction's every 10 days.
 *
 *   node scripts/build-time-scales.mjs [--check]
 *   IERS_FINALS=/path/finals2000A.all IERS_C04=/path/eopc04.1962-now node scripts/build-time-scales.mjs [--check]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

/** The generator's committed inputs, relative to the repository root. */
export const SOURCES = "scripts/time-scale-sources";
export const LEAP_SECONDS = Object.freeze({
  file: "leap-seconds.list",
  url: "https://hpiers.obspm.fr/iers/bul/bulc/ntp/leap-seconds.list",
  retrieved: "2026-09-29",
  source: "IERS leap-seconds.list, retrieved 2026-09-29",
  sha256: "db5a895f16853b03bfc865e8d68f9fc8710ef1740e3400c701cd46a5bbbc3433"
});
export const FINALS = Object.freeze({
  file: "finals2000A-20260924-ut1.csv.gz",
  date: "2026-09-24",
  source: "IERS finals2000A.all (Bulletin A), Last-Modified 2026-09-24T17:37:44Z",
  /** The whole file. */
  sha256: "cc80680ec05c91b65e7d02c6068fe0d44dd0998dc880551975092d2d14aa8e18",
  /** The committed rows, uncompressed. */
  rowsSha256: "50210f290866a54121f2e452191be4c3988ddda5962713f58af3dfba6d3bab89"
});
export const C04 = Object.freeze({
  file: "eopc04-1972.txt",
  url: "https://hpiers.obspm.fr/iers/eop/eopc04/eopc04.1962-now",
  retrieved: "2026-09-29",
  source: "IERS EOP 20 C04 (eopc04.1962-now), Last-Modified 2026-09-28T13:21:06Z",
  /** The whole file, 5,172,852 bytes. */
  sha256: "e16cfbba34574b8bad3cf81e2e56a84c2b4bbfd3c822cf9ebdd860bf97d711dc",
  /** The committed header lines and rows. */
  rowsSha256: "e85f6211d216b8dc1988fddef6da9c079c522e1e4830fda3ac9a4639fe317d55",
  /** MJD of the first and last rows taken: 1972-01-01 and 1973-01-01. */
  from: 41317,
  to: 41683
});
const STEP = 3;
/** 90 printable ASCII characters, "#" to "~" without backslash and backquote. */
const ALPHABET = Array.from({ length: 92 }, (_, index) => String.fromCharCode(35 + index))
  .filter((char) => char !== "\\" && char !== "`")
  .join("");

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const mjdOfNtp = (ntp) => ntp / 86400 + 15020;
/** A Modified Julian Date's 0h UTC as a JavaScript time, ms. */
const msOfMjd = (mjd) => (mjd - 40587) * 86_400_000;
const isoOfMjd = (mjd) => new Date(msOfMjd(mjd)).toISOString().slice(0, 10);

/** The list's leap seconds, update and expiry, after checking its own SHA-1 line. */
export function parseLeapSeconds(text) {
  const rows = [];
  let updated = null;
  let expires = null;
  let hash = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("#$")) updated = Number(line.slice(2).trim());
    else if (line.startsWith("#@")) expires = Number(line.slice(2).trim());
    // Five 32-bit words; the list has at times printed a word without its leading zeros.
    else if (line.startsWith("#h")) hash = line.slice(2).trim().split(/\s+/).map((word) => word.padStart(8, "0")).join("");
    else if (line.trim() && !line.startsWith("#")) {
      const [ntp, dtai] = line.trim().split(/\s+/);
      rows.push([Number(ntp), Number(dtai)]);
    }
  }
  // The hash is SHA-1 over the update and expiry times and every row's two numbers, as text.
  const hashed = [updated, expires, ...rows.flat()].join("");
  const sha1 = createHash("sha1").update(hashed).digest("hex");
  if (sha1 !== hash) throw new Error(`time-scales: leap-seconds.list hash ${sha1} does not match its #h ${hash}`);
  return { rows, updated, expires };
}

/** UT1 - UTC rows of finals2000A.all: [MJD, flag, seconds, formal error]. */
export function parseFinals(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const flag = line.slice(57, 58);
    if ((flag !== "I" && flag !== "P") || !line.slice(58, 68).trim()) continue;
    rows.push([Math.round(Number(line.slice(7, 15))), flag, Number(line.slice(58, 68)), Number(line.slice(68, 78))]);
  }
  return consecutive(rows, "finals");
}

/** The committed finals2000A rows, as text: one line per row of the file with a UT1 - UTC value. */
export function finalsRowsText(rows) {
  return `mjd,date,flag,ut1_minus_utc_s,error_s\n${rows
    .map(([mjd, flag, ut1, error]) => `${mjd},${isoOfMjd(mjd)},${flag},${ut1.toFixed(7)},${error.toFixed(7)}`)
    .join("\n")}\n`;
}

/** The committed finals2000A rows back: [MJD, flag, seconds, formal error]. */
export function parseFinalsRows(text) {
  const rows = text
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const [mjd, , flag, ut1, error] = line.split(",");
      return [Number(mjd), flag, Number(ut1), Number(error)];
    });
  return consecutive(rows, "finals");
}

/** The C04 rows the table takes, with the file's header lines, byte for byte. */
export function c04RowsText(text) {
  const lines = text.split("\n");
  const header = lines.filter((line) => line.startsWith("#"));
  const rows = lines.filter((line) => {
    if (line.startsWith("#") || !line.trim()) return false;
    const mjd = Number(line.trim().split(/\s+/)[4]);
    return mjd >= C04.from && mjd <= C04.to;
  });
  return `${[...header, ...rows].join("\n")}\n`;
}

/** UT1 - UTC rows of the C04 series: [MJD, "C", seconds, formal error]. */
export function parseC04(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue;
    // YR MM DD HH MJD x y UT1-UTC dX dY xrt yrt LOD, then the errors: x y UT1-UTC ...
    const fields = line.trim().split(/\s+/);
    rows.push([Math.round(Number(fields[4])), "C", Number(fields[7]), Number(fields[15])]);
  }
  return consecutive(rows, "C04");
}

function consecutive(rows, what) {
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index][0] !== rows[index - 1][0] + 1) throw new Error(`time-scales: ${what} rows are not consecutive days`);
  }
  return rows;
}

/**
 * The data file's content from the three inputs: `leapText`, the list;
 * `finals`, finals2000A's rows; `c04`, the C04 rows that precede them.
 */
export function build({ leapText, finals, c04 }) {
  const leap = parseLeapSeconds(leapText);
  const changes = leap.rows.map(([ntp, dtai]) => [mjdOfNtp(ntp), dtai]);
  const taiMinusUtc = (mjd) => {
    let value = null;
    for (const [from, dtai] of changes) if (mjd >= from) value = dtai;
    return value;
  };
  if (c04.at(-1)[0] + 1 !== finals[0][0]) throw new Error("time-scales: the C04 rows do not end the day before finals2000A begins");
  const rows = [...c04, ...finals];
  const from = c04[0][0];
  const finalsFrom = finals[0][0];
  const to = finals.at(-1)[0];
  if (from !== changes[0][0]) throw new Error("time-scales: the table does not begin with the leap-second list");
  const observedTo = finals.filter((row) => row[1] === "I").at(-1)[0];
  if (finals.some((row) => (row[1] === "I") !== row[0] <= observedTo)) throw new Error("time-scales: observed rows are not a prefix");
  // UT1 - TAI in milliseconds: the first day, then the grid of finals2000A's rows back into 1972, ending on the last row.
  const ms = new Map(rows.map(([mjd, , ut1]) => [mjd, Math.round((ut1 - taiMinusUtc(mjd)) * 1000)]));
  const gridFrom = finalsFrom - STEP * Math.floor((finalsFrom - from - 1) / STEP);
  const knots = [];
  for (let mjd = gridFrom; mjd < to; mjd += STEP) knots.push(mjd);
  knots.push(to);
  const head = ms.get(from);
  const values = knots.map((mjd) => ms.get(mjd));
  const d1 = values.slice(1).map((value, index) => value - values[index]);
  const d2 = d1.slice(1).map((value, index) => value - d1[index]);
  const limit = Math.max(...d2.map(Math.abs));
  const radix = 2 * limit + 1;
  if (radix * radix > ALPHABET.length) throw new Error(`time-scales: second differences reach ${limit} ms, too many to pack in pairs`);
  let packed = "";
  for (let index = 0; index < d2.length; index += 2) {
    const a = d2[index] + limit;
    const b = (index + 1 < d2.length ? d2[index + 1] : 0) + limit;
    packed += ALPHABET[a * radix + b];
  }
  // Measure the table against every daily row, as the engine reads it.
  const tableAt = (mjd) => {
    if (mjd < gridFrom) return head + ((mjd - from) / (gridFrom - from)) * (values[0] - head);
    const k = Math.min(knots.length - 2, Math.floor((mjd - gridFrom) / STEP));
    return values[k] + ((mjd - knots[k]) / (knots[k + 1] - knots[k])) * (values[k + 1] - values[k]);
  };
  const worst = { c04: 0, finals: 0 };
  for (const [mjd, flag, ut1] of rows) {
    const difference = Math.abs(tableAt(mjd) / 1000 + taiMinusUtc(mjd) - ut1);
    const kind = flag === "C" ? "c04" : "finals";
    worst[kind] = Math.max(worst[kind], difference);
  }
  const bound = Math.max(worst.c04, worst.finals);
  const firstYear = new Date((finalsFrom - 40587) * 86_400_000).getUTCFullYear();
  const observedErrors = [];
  for (const [mjd, flag, , error] of finals) {
    if (flag !== "I") continue;
    const year = new Date((mjd - 40587) * 86_400_000).getUTCFullYear() - firstYear;
    observedErrors[year] = Math.max(observedErrors[year] ?? 0, Math.round(error * 1e6));
  }
  const predictedErrors = [];
  for (let mjd = observedTo + 1; ; mjd = Math.min(mjd + 10, to)) {
    const row = finals[mjd - finalsFrom];
    predictedErrors.push(Math.round(row[3] * 1e6));
    if (mjd === to) break;
  }
  const table = {
    version: FINALS.date,
    source: FINALS.source,
    sha256: FINALS.sha256,
    earlySource: C04.source,
    earlySha256: C04.sha256,
    from,
    finalsFrom,
    observedTo,
    to,
    step: STEP,
    head,
    first: values[0],
    slope: d1[0],
    radix,
    packed,
    bound: Math.ceil(bound * 1e5) / 1e5,
    earlyError: Math.max(...c04.map((row) => Math.round(row[3] * 1e6))),
    firstYear,
    observedErrors,
    predictedErrors
  };
  const list = {
    source: LEAP_SECONDS.source,
    sha256: sha256(leapText),
    updated: isoOfMjd(mjdOfNtp(leap.updated)),
    expires: isoOfMjd(mjdOfNtp(leap.expires)),
    changes
  };
  const digest = sha256(
    JSON.stringify([
      list.changes,
      list.expires,
      table.from,
      table.finalsFrom,
      table.observedTo,
      table.to,
      table.step,
      table.head,
      table.first,
      table.slope,
      table.radix,
      table.packed
    ])
  ).slice(0, 16);
  return { list, table, digest, stats: { rows: rows.length, c04: c04.length, finals: finals.length, knots: knots.length + 1, worst, limit } };
}

export function render({ list, table, digest }) {
  const q = JSON.stringify;
  return `// Generated by scripts/build-time-scales.mjs from ${list.source} (sha256 ${list.sha256}),
// ${table.earlySource} (sha256 ${table.earlySha256}) for 1972
// and ${table.source} (sha256 ${table.sha256}). Do not edit.

/** The IERS leap-second list: MJD of each change and TAI − UTC from it. */
export const LEAP_SECOND_LIST = /*#__PURE__*/ Object.freeze({
  source: ${q(list.source)},
  sha256: ${q(list.sha256)},
  /** The list's last update. */
  updated: ${q(list.updated)},
  /** The list's expiry: after it the last value is carried, not known. */
  expires: ${q(list.expires)},
  changes: /*#__PURE__*/ Object.freeze(/*#__PURE__*/ ${q(list.changes)}.map((change) => Object.freeze(change) as readonly [number, number]))
});

/**
 * UT1 − TAI in ms: from IERS EOP 20 C04 from MJD ${table.from} and from IERS
 * finals2000A.all from ${table.finalsFrom} to ${table.to} (observed to ${table.observedTo}). A knot on
 * the first day (\`head\`), then every ${table.step} days on the grid of the
 * finals2000A rows from the next day, packed as second differences, and one
 * on the last day.
 */
export const UT1_DATA = /*#__PURE__*/ Object.freeze({
  version: ${q(table.version)},
  source: ${q(table.source)},
  sha256: ${q(table.sha256)},
  /** 1972's source. */
  earlySource: ${q(table.earlySource)},
  earlySha256: ${q(table.earlySha256)},
  digest: ${q(digest)},
  from: ${table.from},
  finalsFrom: ${table.finalsFrom},
  observedTo: ${table.observedTo},
  to: ${table.to},
  step: ${table.step},
  head: ${table.head},
  first: ${table.first},
  slope: ${table.slope},
  radix: ${table.radix},
  packed: ${q(table.packed)},
  /** Largest difference, s, between the table and any daily IERS value it was built from. */
  bound: ${table.bound},
  /** C04's largest formal error in 1972, µs. */
  earlyError: ${table.earlyError},
  firstYear: ${table.firstYear},
  /** Largest observed formal error of each year of finals2000A from firstYear, µs. */
  observedErrors: ${q(table.observedErrors)},
  /** The prediction's formal error every 10 days after observedTo, and on its last day, µs. */
  predictedErrors: ${q(table.predictedErrors)}
});

// The bounds src/time-scale.ts compares instants with, written as numbers: a
// value computed from a table when its module loads keeps the table in a
// program that does not use it (scripts/pure-tables.mjs).
/** UT1_DATA's first day, 0h UTC, ms. */
export const UT1_FROM_MS = ${msOfMjd(table.from)};
/** UT1_DATA's first finals2000A day, 0h UTC, ms. */
export const UT1_FINALS_FROM_MS = ${msOfMjd(table.finalsFrom)};
/** UT1_DATA's last observed day, 0h UTC, ms. */
export const UT1_OBSERVED_TO_MS = ${msOfMjd(table.observedTo)};
/** UT1_DATA's last day, 0h UTC, ms. */
export const UT1_TO_MS = ${msOfMjd(table.to)};
/** Knots of UT1_DATA's ${table.step}-day grid before its first finals2000A day: the grid runs from its second day. */
export const UT1_GRID_BEFORE = ${Math.floor((table.finalsFrom - table.from - 1) / table.step)};
/** LEAP_SECOND_LIST's expiry, 0h UTC, ms. */
export const LEAP_SECONDS_EXPIRE_MS = ${Date.parse(`${list.expires}T00:00:00Z`)};
`;
}

/** The committed inputs, checked against their pinned digests. */
export function readSources(root) {
  const at = (file) => resolve(root, SOURCES, file);
  const leapText = readFileSync(at(LEAP_SECONDS.file), "utf8");
  if (sha256(leapText) !== LEAP_SECONDS.sha256) throw new Error(`time-scales: ${LEAP_SECONDS.file} has another SHA-256 than ${LEAP_SECONDS.sha256}`);
  const finalsText = gunzipSync(readFileSync(at(FINALS.file))).toString("utf8");
  if (sha256(finalsText) !== FINALS.rowsSha256) throw new Error(`time-scales: ${FINALS.file} holds other rows than ${FINALS.rowsSha256}`);
  const c04Text = readFileSync(at(C04.file), "latin1");
  if (sha256(Buffer.from(c04Text, "latin1")) !== C04.rowsSha256) throw new Error(`time-scales: ${C04.file} has another SHA-256 than ${C04.rowsSha256}`);
  return { leapText, finalsText, c04Text };
}

function wholeFile(variable, expected) {
  const path = process.env[variable];
  if (!path) return null;
  const bytes = readFileSync(path);
  const digest = sha256(bytes);
  if (digest !== expected) throw new Error(`time-scales: ${path} has sha256 ${digest}, expected ${expected}`);
  return bytes.toString("latin1");
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const check = process.argv.includes("--check");
  const sources = readSources(root);
  // With the whole files, the committed rows must be what they give.
  const finalsFile = wholeFile("IERS_FINALS", FINALS.sha256);
  const c04File = wholeFile("IERS_C04", C04.sha256);
  const rewritten = [];
  if (finalsFile !== null && finalsRowsText(parseFinals(finalsFile)) !== sources.finalsText) rewritten.push(FINALS.file);
  if (c04File !== null && c04RowsText(c04File) !== sources.c04Text) rewritten.push(C04.file);
  const built = build({
    leapText: sources.leapText,
    finals: parseFinalsRows(finalsFile === null ? sources.finalsText : finalsRowsText(parseFinals(finalsFile))),
    c04: parseC04(c04File === null ? sources.c04Text : c04RowsText(c04File))
  });
  const dataPath = resolve(root, "src/time-scale-data.ts");
  const text = render(built);
  if (check) {
    let committed = null;
    try {
      committed = readFileSync(dataPath, "utf8");
    } catch {}
    if (committed !== text || rewritten.length) {
      console.error(`time-scales: ${[...(committed !== text ? ["src/time-scale-data.ts"] : []), ...rewritten].join(", ")} differ from their sources; run node scripts/build-time-scales.mjs`);
      process.exit(1);
    }
    const whole = [finalsFile && "finals2000A.all", c04File && "eopc04.1962-now"].filter(Boolean);
    console.log(`time-scales: src/time-scale-data.ts matches ${SOURCES}/${whole.length ? `, and its rows match ${whole.join(" and ")}` : ""}`);
    return;
  }
  // gzip without a timestamp or name, so the bytes depend on the content alone.
  if (rewritten.includes(FINALS.file)) writeFileSync(resolve(root, SOURCES, FINALS.file), gzipSync(Buffer.from(finalsRowsText(parseFinals(finalsFile))), { level: 9 }));
  if (rewritten.includes(C04.file)) writeFileSync(resolve(root, SOURCES, C04.file), Buffer.from(c04RowsText(c04File), "latin1"));
  writeFileSync(dataPath, text);
  const { stats } = built;
  console.log(
    `time-scales: ${stats.c04} C04 and ${stats.finals} finals2000A days in ${stats.knots} knots (second differences within ±${stats.limit} ms), ` +
      `largest difference ${(stats.worst.c04 * 1000).toFixed(3)} ms from C04 and ${(stats.worst.finals * 1000).toFixed(3)} ms from finals2000A` +
      `${rewritten.length ? `; rewrote ${rewritten.join(", ")}` : ""} -> src/time-scale-data.ts`
  );
}

const direct = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (direct) await main();
