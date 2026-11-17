#!/usr/bin/env node
/*
 * Which site-parity cases the continuous-UTC rule changed, and by how much:
 *
 *   node site-parity-changes.mjs <outputs before> <outputs after> > results/site-parity-changes.json
 *
 * Each directory holds returns.json, void-of-course.json and moon-sign.json
 * (src/techniques/fixtures/site-parity/ on origin/main, and as regenerated
 * on this tree). For each corpus: the cases, how many changed, how many of
 * those touch no instant after the IERS table's end (2027-10-02T00:00Z) in
 * their input or output ("unexplained", which must be 0), the largest shift
 * of an output instant, and the largest shift of an output instant at or
 * before the table's end (a return found from a birth after it).
 */
import fs from "node:fs";
import { returnsCorpus, voidCorpus, moonSignCorpus } from "../../../scripts/techniques-parity-corpus.mjs";
const END = 1822435200000;
const [before, out] = process.argv.slice(2);
const load = (n, dir) => JSON.parse(fs.readFileSync(`${dir}/${n}`, "utf8"));
const corpora = { ...returnsCorpus(), ...voidCorpus(), ...moonSignCorpus() };
const nums = (v, acc = []) => { if (typeof v === "number" && Math.abs(v) > 1e11) acc.push(v); else if (v && typeof v === "object") Object.values(v).forEach((x) => nums(x, acc)); return acc; };
const summary = {};
for (const n of ["returns.json", "void-of-course.json", "moon-sign.json"]) {
  const a = load(n, before), b = load(n, out);
  for (const key of Object.keys(a)) {
    if (key === "meta") continue;
    const corpusKey = key;
    const cases = corpora[corpusKey] ?? corpora[key.replace("-", "")];
    let changed = 0, unexplained = 0, maxShift = 0, maxIn = 0;
    if (!Array.isArray(a[key])) { summary[`${n}:${key}`] = JSON.stringify(a[key]) === JSON.stringify(b[key]) ? "same (not a list)" : "DIFF (not a list)"; continue; }
    a[key].forEach((oldOut, i) => {
      const newOut = b[key][i];
      if (JSON.stringify(oldOut) === JSON.stringify(newOut)) return;
      changed++;
      const input = cases?.[i];
      const instants = [...nums(input), ...nums(oldOut), ...nums(newOut)];
      const dateAfter = input && typeof input === "object" && input.date ? Date.parse(input.date + "T00:00:00Z") + 86400000 * 2 > END : typeof input === "string" ? Date.parse(input) + 2 * 86400000 > END : false;
      if (!instants.some((t) => t > END) && !dateAfter) unexplained++;
      const o = nums(oldOut), w = nums(newOut);
      o.forEach((t, j) => { if (w[j] !== undefined) { maxShift = Math.max(maxShift, Math.abs(w[j] - t)); if (t <= END) maxIn = Math.max(maxIn, Math.abs(w[j]-t)); } });
    });
    summary[`${n}:${key}`] = { cases: a[key].length, changed, unexplained, maxShiftMs: maxShift, maxShiftOfInstantAtOrBeforeTableEndMs: maxIn };
  }
}
process.stdout.write(`${JSON.stringify(summary, null, 1)}\n`);
