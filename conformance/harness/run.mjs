#!/usr/bin/env node
/*
 * Run an adapter over the suite and write, or check, a results file.
 *
 *   node conformance/harness/run.mjs --adapter "<command>" --out conformance/results/<name>.json
 *       [--levels L1,L2,L3] [--values residuals|none]
 *   node conformance/harness/run.mjs --adapter "<command>" --check conformance/results/<name>.json
 *
 * --values none writes verdicts and summary statistics only, with no
 * per-vector residuals (used for instruments whose outputs are not ours to
 * publish). --check reruns the adapter and fails if any vector's verdict
 * differs from the committed results, or if the vectors changed since.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LEVEL_FILES, SUITE, SUITE_VERSION, judge, readSuite, runAdapter, summarize, validateLevel } from './lib.mjs';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const command = option('adapter');
const out = option('out');
const check = option('check');
const values = option('values', 'residuals');
const levels = option('levels', Object.keys(LEVEL_FILES).join(',')).split(',');
if (!command || (!out && !check) || !['residuals', 'none'].includes(values)) {
  console.error('usage: run.mjs --adapter "<command>" (--out <file> | --check <file>) [--levels L1,L2,L3] [--values residuals|none]');
  process.exit(2);
}

const suite = readSuite(undefined, levels);
const problems = suite.flatMap((level) => validateLevel(level));
if (problems.length) {
  console.error(`conformance: the vectors do not conform to SPEC.md:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
const vectors = suite.flatMap((level) => level.file.vectors);
const { adapter, responses } = await runAdapter(command, vectors);

const results = vectors.map((vector) => {
  const response = responses.get(vector.id);
  const judged = judge(vector, response);
  const entry = { id: vector.id, verdict: judged.verdict };
  if (values === 'residuals' && judged.residual) entry.residual = judged.residual;
  if (judged.detail) entry.detail = judged.detail;
  if (response?.meta) entry.meta = response.meta;
  return { entry, judged };
});
const summary = summarize(vectors, results.map(({ entry, judged }) => ({ ...entry, residual: judged.residual })));
const document = {
  suite: SUITE,
  suiteVersion: SUITE_VERSION,
  vectors: Object.fromEntries(suite.map((level) => [LEVEL_FILES[level.level], level.digest])),
  adapter,
  values,
  summary,
  results: results.map(({ entry }) => entry),
};

const line = (name, bucket) => `${name}: ${bucket.pass} pass, ${bucket.fail} fail, ${bucket.unsupported} unsupported, ${bucket.error} error (of ${bucket.count})`;
console.log(line(`${adapter.name} ${adapter.engineVersion ?? ''}`.trim(), summary.total));
for (const [level, bucket] of Object.entries(summary.byLevel)) console.log(`  ${line(level, bucket)}`);

if (check) {
  const committed = JSON.parse(readFileSync(resolve(check), 'utf8'));
  const drift = [];
  for (const [file, digest] of Object.entries(document.vectors)) {
    if (committed.vectors?.[file] !== digest) drift.push(`${file} changed since ${check} was written; regenerate it`);
  }
  const before = new Map((committed.results ?? []).map((entry) => [entry.id, entry.verdict]));
  for (const { entry } of results) {
    if (before.get(entry.id) !== entry.verdict) drift.push(`${entry.id}: ${before.get(entry.id) ?? 'absent'} → ${entry.verdict}${entry.detail ? ` (${entry.detail})` : ''}`);
  }
  if (drift.length) {
    console.error(`conformance: ${drift.length} verdict(s) differ from ${check}:\n  ${drift.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`conformance: every verdict matches ${check}`);
} else {
  writeFileSync(resolve(out), `${JSON.stringify(document, null, 2)}\n`);
  console.log(`conformance: wrote ${out}`);
}
