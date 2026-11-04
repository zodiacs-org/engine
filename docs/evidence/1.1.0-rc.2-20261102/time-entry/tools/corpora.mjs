// The corpora of the time entry's checks, exactly as section 5 of
// ../PREREGISTRATION.md fixes them: K1 (the site generator's instants), K2
// (seeded: K2a, K2b and the ten vectors V2), K3 (seams not in K1), K4 (the
// ERFA fixture's TT instants) and V (the five directions of
// src/nutation.test.ts, then V2). Run directly, it prints each corpus's size
// and the SHA-256 of its JSON text, and writes them to [out.json].
//
//   node corpora.mjs <src/fixtures/nutation-erfa.json> [out.json]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DAY = 86_400_000;

/** K1: every tenth day at noon from 1800-01-01 while before 2200, then 31 edges at -1,000, -1, 0, +1 and +1,000 ms. */
export function k1() {
  const instants = [];
  for (let t = Date.UTC(1800, 0, 1, 12); t < Date.UTC(2200, 0, 1); t += 10 * DAY) instants.push(t);
  const edges = [Date.UTC(1972, 0, 1), Date.UTC(1973, 0, 2), Date.UTC(2027, 9, 2), Date.UTC(2027, 5, 28)];
  for (const [year, month] of [[1972, 6], [1973, 0], [1974, 0], [1975, 0], [1976, 0], [1977, 0], [1978, 0], [1979, 0], [1980, 0],
    [1981, 6], [1982, 6], [1983, 6], [1985, 6], [1988, 0], [1990, 0], [1991, 0], [1992, 6], [1993, 6], [1994, 6], [1996, 0],
    [1997, 6], [1999, 0], [2006, 0], [2009, 0], [2012, 6], [2015, 6], [2017, 0]]) edges.push(Date.UTC(year, month, 1));
  for (const edge of edges) instants.push(edge - 1_000, edge - 1, edge, edge + 1, edge + 1_000);
  return instants;
}

/** The preregistration's mulberry32, verbatim. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** K2 from one stream with seed 531102, in this order: K2a, K2b, then V2. */
export function k2() {
  const u = mulberry32(531102);
  const draw = (lo, hi, count) => Array.from({ length: count }, () => Math.floor(lo + u() * (hi - lo)));
  const k2a = draw(-5_364_662_400_000, 7_258_118_400_000, 50_000);
  const k2b = draw(-8.64e15, 8.64e15, 50_000);
  const v2 = [];
  while (v2.length < 10) {
    const v = [2 * u() - 1, 2 * u() - 1, 2 * u() - 1];
    const norm = Math.hypot(...v);
    if (norm < 0.1 || norm > 1) continue;
    v2.push(v.map((c) => c / norm));
  }
  return { k2a, k2b, v2 };
}

/** K3: the seams, at -1,000, -1, 0, +1 and +1,000 ms; the ends of the Date range only at offsets inside it. */
export function k3() {
  const seams = [Date.UTC(2026, 8, 24), Date.parse("2027-10-02T00:00:00.148Z"), -915_170_400_000, -441_806_400_000,
    -84_889_944_000_000, -62_125_272_000_000, 64_018_728_000_000, -8.64e15, 8.64e15];
  const out = [];
  for (const seam of seams) for (const offset of [-1_000, -1, 0, 1, 1_000]) if (Math.abs(seam + offset) <= 8.64e15) out.push(seam + offset);
  return out;
}

/** K4: the 101 `epochs[].tt` of src/fixtures/nutation-erfa.json, at `path`. */
export function k4(path) {
  return JSON.parse(readFileSync(path, "utf8")).epochs.map((epoch) => epoch.tt);
}

/** V: the five directions of src/nutation.test.ts, then V2. */
export function vectors(v2 = k2().v2) {
  return [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.36, -0.48, 0.8], [-0.6, 0.64, -0.48], ...v2];
}

/** The pins each corpus is checked at: three scales, each without a pin and with 69.184 s and -1.5 s. */
export const SCALES = Object.freeze(["utc", "ut1", "tt"]);
export const PINS = Object.freeze([undefined, 69.184, -1.5]);

const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Each corpus with its size and digest. */
export function corpora(fixturePath) {
  const { k2a, k2b, v2 } = k2();
  const all = { K1: k1(), K2a: k2a, K2b: k2b, V2: v2, K3: k3(), K4: k4(fixturePath), V: vectors(v2) };
  return Object.fromEntries(Object.entries(all).map(([name, values]) => [name, { count: values.length, sha256: digest(values) }]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [fixture, out] = process.argv.slice(2);
  if (!fixture) throw new Error("usage: node corpora.mjs <src/fixtures/nutation-erfa.json> [out.json]");
  const report = { tool: "corpora.mjs", node: process.version, corpora: corpora(fixture) };
  const text = `${JSON.stringify(report, null, 1)}\n`;
  if (out) writeFileSync(out, text);
  process.stdout.write(text);
}
