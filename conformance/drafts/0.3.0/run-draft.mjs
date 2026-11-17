#!/usr/bin/env node
/*
 * Run an adapter over the draft level L4 (event times) and write, or check,
 * a results file. The released harness (../../harness/run.mjs) never reads
 * this level; this runner reuses its adapter protocol and its tolerance
 * comparison (`runAdapter` and `judge` in ../../harness/lib.mjs) unchanged,
 * and carries its own table of the draft's kinds, since the harness's
 * table is the released suite's.
 *
 *   node conformance/drafts/0.3.0/run-draft.mjs --adapter "<command>" --out conformance/drafts/0.3.0/<name>.json
 *   node conformance/drafts/0.3.0/run-draft.mjs --adapter "<command>" --check conformance/drafts/0.3.0/<name>.json
 *
 * --check reruns the adapter and fails if any vector's verdict differs from
 * the committed results, or if the vector file changed since.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BODIES, SUITE, SUITE_DIR, judge, runAdapter, sha256 } from '../../harness/lib.mjs';

export const DRAFT_VERSION = '0.3.0-draft';
export const DRAFT_DIR = dirname(fileURLToPath(import.meta.url));
export const DRAFT_FILE = resolve(DRAFT_DIR, 'L4-events.json');

/** The draft's kinds: each allowed pair of input keys and expected keys (DESIGN.md, "Kinds"). */
export const DRAFT_KINDS = Object.freeze({
  'event.ingress': [
    { input: ['body', 'longitude_deg', 'after_tt_s', 'before_tt_s'], expected: ['tt_s'] },
    { input: ['body', 'longitude_deg', 'after_utc_s', 'before_utc_s'], expected: ['utc_s'] },
  ],
  'event.station': [
    { input: ['body', 'after_tt_s', 'before_tt_s'], expected: ['tt_s', 'direction'] },
  ],
  'event.lunation': [
    { input: ['phase_deg', 'after_tt_s', 'before_tt_s'], expected: ['tt_s'] },
    { input: ['phase_deg', 'after_utc_s', 'before_utc_s'], expected: ['utc_s'] },
  ],
});
const PREFIXES = { ING: 'event.ingress', STA: 'event.station', LUN: 'event.lunation', UTC: null };
const same = (keys, shape) => keys.length === shape.length && shape.every((key) => keys.includes(key));

export function readDraft(path = DRAFT_FILE) {
  const bytes = readFileSync(path);
  return { path, digest: sha256(bytes), file: JSON.parse(bytes.toString('utf8')) };
}

/** Problems with the draft vector file; an empty list means it conforms to DESIGN.md's shapes. */
export function validateDraft(file, root = SUITE_DIR) {
  const problems = [];
  if (file.suite !== SUITE) problems.push(`suite must be ${SUITE}`);
  if (file.suiteVersion !== DRAFT_VERSION) problems.push(`suiteVersion must be ${DRAFT_VERSION}`);
  if (file.level !== 'L4') problems.push('level must be L4');
  for (const [id, arbiter] of Object.entries(file.arbiters ?? {})) {
    for (const field of ['name', 'source', 'method', 'generator', 'uncertainty']) {
      if (typeof arbiter[field] !== 'string' || !arbiter[field].trim()) problems.push(`arbiter ${id}: ${field} is required`);
    }
    if (/swiss|swisseph|sweph/iu.test(`${id} ${arbiter.name}`)) problems.push(`arbiter ${id}: Swiss Ephemeris may not be an arbiter`);
    for (const input of arbiter.inputs ?? []) {
      if (input.url !== undefined && input.path === undefined) {
        if (!/^https:\/\/\S+$/u.test(input.url) || !/^[0-9a-f]{64}$/u.test(input.sha256 ?? '')) problems.push(`arbiter ${id}: input ${input.url} needs an https URL and a sha256`);
        continue;
      }
      const path = resolve(root, input.path ?? '');
      if (!input.path || !existsSync(path)) problems.push(`arbiter ${id}: input ${input.path} is missing`);
      else if (sha256(readFileSync(path)) !== input.sha256) problems.push(`arbiter ${id}: input ${input.path} does not match its sha256`);
    }
    if (!existsSync(resolve(root, arbiter.generator ?? ''))) problems.push(`arbiter ${id}: generator ${arbiter.generator} is missing`);
  }
  if (!Array.isArray(file.dropped) || file.dropped.some((entry) => !entry.id || !entry.what || !entry.reason)) problems.push('dropped must list { id, what, reason }');
  const ids = new Set([...(file.dropped ?? []).map((entry) => entry.id)]);
  for (const vector of file.vectors ?? []) {
    const at = `vector ${vector.id}`;
    const match = /^L4-(ING|STA|LUN|UTC)-\d{4}$/u.exec(vector.id ?? '');
    if (!match) problems.push(`${at}: id must be L4-<ING|STA|LUN|UTC>-<4 digits>`);
    if (ids.has(vector.id)) problems.push(`${at}: duplicate id (or also dropped)`);
    ids.add(vector.id);
    const shapes = DRAFT_KINDS[vector.kind];
    if (!shapes) {
      problems.push(`${at}: unknown kind ${vector.kind}`);
      continue;
    }
    if (match && PREFIXES[match[1]] && PREFIXES[match[1]] !== vector.kind) problems.push(`${at}: an ${match[1]} id holds ${vector.kind}`);
    const inputKeys = Object.keys(vector.input ?? {});
    const expectedKeys = Object.keys(vector.expected ?? {});
    const shape = shapes.find((candidate) => same(inputKeys, candidate.input) && same(expectedKeys, candidate.expected));
    if (!shape) {
      problems.push(`${at}: input ${inputKeys.join(', ')} with expected ${expectedKeys.join(', ')} is not a shape of ${vector.kind}`);
      continue;
    }
    const utc = expectedKeys.includes('utc_s');
    if (match?.[1] === 'UTC' ? !utc : utc) problems.push(`${at}: the UTC set, and only it, takes utc_s`);
    if (utc && !(vector.tags ?? []).includes('utc-input')) problems.push(`${at}: a UTC vector is tagged utc-input`);
    for (const key of expectedKeys) {
      const rule = vector.tolerance?.[key];
      if (key === 'direction') {
        if (JSON.stringify(rule) !== '{"exact":true}') problems.push(`${at}: direction is compared exactly`);
        if (!['retrograde', 'direct'].includes(vector.expected.direction)) problems.push(`${at}: direction is retrograde or direct`);
      } else if (!(rule && rule.unit === 's' && Number.isInteger(rule.abs) && rule.abs >= 1 && Object.keys(rule).length === 2)) {
        problems.push(`${at}: ${key} needs a tolerance { abs: whole seconds >= 1, unit: "s" }`);
      }
    }
    for (const key of Object.keys(vector.tolerance ?? {})) if (!expectedKeys.includes(key)) problems.push(`${at}: tolerance for ${key}, which is not expected`);
    if ('body' in vector.input && !BODIES.includes(vector.input.body)) problems.push(`${at}: unknown body ${vector.input.body}`);
    if ('longitude_deg' in vector.input && !(Number.isInteger(vector.input.longitude_deg) && vector.input.longitude_deg % 30 === 0 && vector.input.longitude_deg >= 0 && vector.input.longitude_deg < 360)) problems.push(`${at}: longitude_deg is a multiple of 30 in [0, 360)`);
    if ('phase_deg' in vector.input && ![0, 180].includes(vector.input.phase_deg)) problems.push(`${at}: phase_deg is 0 or 180`);
    const scale = utc ? 'utc' : 'tt';
    const after = vector.input[`after_${scale}_s`];
    const before = vector.input[`before_${scale}_s`];
    const instant = vector.expected[`${scale}_s`];
    if (!(after < instant && instant <= before)) problems.push(`${at}: the expected instant is not in the window (after, before]`);
    if (vector.arbiter === undefined || !file.arbiters?.[vector.arbiter]) problems.push(`${at}: arbiter ${vector.arbiter} is not listed`);
    if (vector.tags !== undefined && !(Array.isArray(vector.tags) && vector.tags.every((tag) => /^[a-z0-9]+(-[a-z0-9]+)*$/u.test(tag)))) problems.push(`${at}: tags are lowercase-hyphenated strings`);
    for (const key of Object.keys(vector)) if (!['id', 'kind', 'input', 'expected', 'tolerance', 'arbiter', 'note', 'tags'].includes(key)) problems.push(`${at}: unknown key ${key}`);
  }
  return problems;
}

const tidy = (value) => Number(value.toPrecision(9));
const median = (sorted) => (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);

/** Counts per kind and per tag, and the residuals per kind as seconds and as fractions of the tolerance. */
export function summarizeDraft(vectors, results) {
  const byId = new Map(results.map((result) => [result.id, result]));
  const blank = () => ({ count: 0, pass: 0, fail: 0, unsupported: 0, error: 0 });
  const total = blank();
  const byKind = {};
  const byTag = {};
  const residuals = {};
  for (const vector of vectors) {
    const result = byId.get(vector.id);
    const buckets = [total, (byKind[vector.kind] ??= blank())];
    for (const tag of vector.tags ?? []) buckets.push((byTag[tag] ??= blank()));
    for (const bucket of buckets) {
      bucket.count += 1;
      bucket[result.verdict] += 1;
    }
    for (const [field, value] of Object.entries(result.residual ?? {})) {
      const entry = (residuals[`${vector.kind} ${field}`] ??= { kind: vector.kind, field, seconds: [], ratios: [] });
      entry.seconds.push(Math.abs(value));
      entry.ratios.push(Math.abs(value) / vector.tolerance[field].abs);
    }
  }
  for (const entry of Object.values(residuals)) {
    const seconds = entry.seconds.sort((a, b) => a - b);
    const ratios = entry.ratios.sort((a, b) => a - b);
    byKind[entry.kind].residuals ??= {};
    byKind[entry.kind].residuals[entry.field] = {
      unit: 's', n: seconds.length, median: tidy(median(seconds)), max: tidy(seconds.at(-1)),
      maxOfTolerance: tidy(ratios.at(-1)),
    };
  }
  return { total, byKind, byTag };
}

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function main() {
  const command = option('adapter');
  const out = option('out');
  const check = option('check');
  const path = resolve(option('file', DRAFT_FILE));
  if (!command || (!out && !check)) {
    console.error('usage: run-draft.mjs --adapter "<command>" (--out <file> | --check <file>) [--file L4-events.json]');
    process.exit(2);
  }
  const draft = readDraft(path);
  const problems = validateDraft(draft.file);
  if (problems.length) {
    console.error(`conformance draft: the vectors do not conform to DESIGN.md:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  const { vectors } = draft.file;
  const { adapter, responses } = await runAdapter(command, vectors);
  const results = vectors.map((vector) => {
    const response = responses.get(vector.id);
    const judged = judge(vector, response);
    const entry = { id: vector.id, verdict: judged.verdict };
    if (judged.residual) entry.residual = judged.residual;
    if (judged.detail) entry.detail = judged.detail;
    if (response?.meta) entry.meta = response.meta;
    return entry;
  });
  const summary = summarizeDraft(vectors, results);
  const name = relative(SUITE_DIR, path).split('\\').join('/');
  const document = { suite: SUITE, suiteVersion: DRAFT_VERSION, level: 'L4', vectors: { [name]: draft.digest }, adapter, values: 'residuals', summary, results };
  const line = (label, bucket) => `${label}: ${bucket.pass} pass, ${bucket.fail} fail, ${bucket.unsupported} unsupported, ${bucket.error} error (of ${bucket.count})`;
  console.log(line(`${adapter.name} ${adapter.engineVersion ?? ''}`.trim(), summary.total));
  for (const [kind, bucket] of Object.entries(summary.byKind)) console.log(`  ${line(kind, bucket)}`);
  for (const [tag, bucket] of Object.entries(summary.byTag)) console.log(`  ${line(`tag ${tag}`, bucket)}`);
  if (check) {
    const committed = JSON.parse(readFileSync(resolve(check), 'utf8'));
    const drift = [];
    if (committed.vectors?.[name] !== draft.digest) drift.push(`${name} changed since ${check} was written; regenerate it`);
    const before = new Map((committed.results ?? []).map((entry) => [entry.id, entry.verdict]));
    for (const entry of results) {
      if (before.get(entry.id) !== entry.verdict) drift.push(`${entry.id}: ${before.get(entry.id) ?? 'absent'} -> ${entry.verdict}${entry.detail ? ` (${entry.detail})` : ''}`);
    }
    if (drift.length) {
      console.error(`conformance draft: ${drift.length} difference(s) from ${check}:\n  ${drift.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`conformance draft: every verdict matches ${check}`);
  } else {
    writeFileSync(resolve(out), `${JSON.stringify(document, null, 2)}\n`);
    console.log(`conformance draft: wrote ${out}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
