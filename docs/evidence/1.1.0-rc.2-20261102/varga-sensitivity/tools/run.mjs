/*
 * G-V3's run (PREREGISTRATION.md, section 8): vargaSensitivity from the
 * package under test on every birth of F2 (births.json), every case of F3
 * (seams.json) and every case of F3b (seams-f3b.json, added after review 1 by
 * the amendment of 2026-11-03 in section 13), in their order, one call each,
 * nothing dropped or rerun on its own. For G-V4, the same on F4 (--births
 * births-erfa.json --seams none --f3b none).
 *
 *   node run.mjs [--births FILE|none] [--seams FILE|none] [--f3b FILE|none] [--out DIR] [--limit N]
 *
 * Writes DIR/results.jsonl, one line per call ({ corpus, id, birth, ayanamsa,
 * options, ms, result } or, if the call threw, { ..., error }), and DIR/run.json
 * (the package, Node, the platform, the corpora and their SHA-256, the counts
 * and the run times). DIR defaults to ../results. --limit N runs the first N
 * calls of each corpus; it is for trials, and run.json records it. Load the
 * package as load.mjs says (ZODIACS_ENGINE_DIST). Run alone: one heavy job.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { FOLDER, ayanamsaOf, callsOf, loadEngine, options } from "./load.mjs";

const args = options(process.argv.slice(2), ["--births", "--seams", "--f3b", "--out", "--limit"]);
const out = resolve(args.get("--out") ?? resolve(FOLDER, "results"));
const limit = args.has("--limit") ? Number(args.get("--limit")) : null;
const sources = [
  ...(args.get("--births") === "none" ? [] : [["F2", resolve(args.get("--births") ?? resolve(FOLDER, "births.json"))]]),
  ...(args.get("--seams") === "none" ? [] : [["F3", resolve(args.get("--seams") ?? resolve(FOLDER, "seams.json"))]]),
  ...(args.get("--f3b") === "none" ? [] : [["F3b", resolve(args.get("--f3b") ?? resolve(FOLDER, "seams-f3b.json"))]])
];
const engine = await loadEngine();
const { vedic } = engine;
mkdirSync(out, { recursive: true });

const lines = [];
const corpora = [];
const began = performance.now();
for (const [name, path] of sources) {
  const text = readFileSync(path);
  const corpus = JSON.parse(text);
  const label = corpus.corpus?.startsWith("F4") ? "F4" : name;
  const calls = callsOf(corpus, label).slice(0, limit ?? undefined);
  corpora.push({ corpus: label, file: path, sha256: createHash("sha256").update(text).digest("hex"), seed: corpus.seed ?? null, calls: calls.length });
  for (const call of calls) {
    const line = { corpus: call.corpus, id: call.id, birth: call.birth, ayanamsa: call.ayanamsa, options: call.options };
    const started = performance.now();
    try {
      line.result = vedic.vargaSensitivity(call.birth, ayanamsaOf(vedic, call.ayanamsa), call.options);
    } catch (thrown) {
      line.error = String(thrown?.stack ?? thrown);
    }
    line.ms = Math.round((performance.now() - started) * 1000) / 1000;
    lines.push(line);
    if (lines.length % 100 === 0) process.stderr.write(`${lines.length} calls, ${((performance.now() - began) / 60000).toFixed(1)} min\n`);
  }
}
writeFileSync(resolve(out, "results.jsonl"), lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
const times = lines.map((line) => line.ms).sort((a, b) => a - b);
const run = {
  tool: "docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/run.mjs",
  engine: { version: engine.version, jsFiles: engine.jsFiles, jsDigest: engine.jsDigest },
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  limit,
  corpora,
  calls: lines.length,
  threw: lines.filter((line) => line.error).map((line) => `${line.corpus} ${line.id}`),
  callMs: { mean: times.reduce((a, b) => a + b, 0) / Math.max(1, times.length), median: times[Math.floor(times.length / 2)] ?? null, max: times.at(-1) ?? null },
  wallMinutes: (performance.now() - began) / 60000
};
writeFileSync(resolve(out, "run.json"), JSON.stringify(run, null, 1) + "\n");
console.log(JSON.stringify({ calls: run.calls, threw: run.threw.length, callMs: run.callMs, wallMinutes: run.wallMinutes.toFixed(2) }));
