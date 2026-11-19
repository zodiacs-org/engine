/*
 * Compares one runtime's run of the conformance suite with Node's: verdicts,
 * values and receipt digests. The pass mark stays the vectors' own arbiters
 * (the harness's verdicts); Node's values are used only to measure how far
 * another runtime's values are from them.
 */
import { createHash } from 'node:crypto';

export const NATIVE_RUNTIMES = Object.freeze(['node', 'bun', 'deno']);
export const BROWSER_RUNTIMES = Object.freeze(['chromium', 'firefox', 'webkit']);
export const RUNTIMES = Object.freeze([...NATIVE_RUNTIMES, ...BROWSER_RUNTIMES]);

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/**
 * Whether a vector's answer depends on the host's Intl time zone data: a zone
 * offset at a local time in 1970 or later, which the engine reads from the
 * host (before 1970 it reads the tzdb history it ships).
 */
export const dependsOnHostZoneData = (vector) => vector.kind === 'time.zone-offset' && Number(vector.input.local.slice(0, 4)) >= 1970;

/** The lines an adapter wrote, as kept by tee-adapter.mjs: its header and its answers by id, with any id answered twice. */
export function readRaw(text) {
  const lines = text.split('\n').filter((line) => line.trim());
  const header = JSON.parse(lines[0] ?? 'null');
  const answers = new Map();
  const repeated = [];
  for (const line of lines.slice(1)) {
    const answer = JSON.parse(line);
    if (answers.has(answer.id)) repeated.push(answer.id);
    answers.set(answer.id, answer);
  }
  return { header, answers, repeated };
}

/** The signed difference b − a on the circle when the rule wraps, in the values' own unit (degrees or seconds). */
function signedDifference(rule, a, b) {
  let delta = b - a;
  if (rule.wrap) {
    delta %= rule.wrap;
    if (delta > rule.wrap / 2) delta -= rule.wrap;
    if (delta <= -rule.wrap / 2) delta += rule.wrap;
  }
  return delta;
}

/**
 * How far one field's value is from Node's: { identical, abs } where abs is
 * the largest absolute difference (over the cusps for a list) in the value's
 * own unit, or null where the field is compared exactly or is not a number.
 */
export function fieldDifference(rule, nodeValue, value) {
  const identical = JSON.stringify(nodeValue) === JSON.stringify(value);
  if (!rule || rule.exact) return { identical, abs: null };
  if (rule.each) {
    if (!Array.isArray(nodeValue) || !Array.isArray(value) || nodeValue.length !== value.length) return { identical, abs: null };
    let abs = 0;
    for (let index = 0; index < value.length; index += 1) {
      const one = fieldDifference(rule.each, nodeValue[index], value[index]);
      if (one.abs === null) return { identical, abs: null };
      abs = Math.max(abs, one.abs);
    }
    return { identical, abs };
  }
  if (typeof nodeValue !== 'number' || typeof value !== 'number') return { identical, abs: null };
  return { identical, abs: Math.abs(signedDifference(rule, nodeValue, value)) };
}

/** The unit a rule's values are written in: degrees for an arcsecond tolerance (the values are degrees), else the rule's unit. */
const valueUnit = (rule) => {
  const base = rule?.each ?? rule;
  if (!base || base.exact) return 'exact';
  return base.unit === 'arcsec' || base.unit === 'deg' ? 'deg' : base.unit;
};

/**
 * One runtime's summary against Node's run.
 *
 * vectors: the suite's vectors in order. node and runtime: { results (the
 * harness's results file), raw (readRaw of the adapter's lines), receipts
 * (the runtime's receipt texts) }. expected: the runtime this run should be.
 * entry: the entry that both adapters must report.
 */
export function compareWithNode({ vectors, node, runtime, expected, entry = 'root' }) {
  const problems = [];
  const reported = runtime.results.adapter?.runtime ?? null;
  if (!reported) problems.push(`the results file does not name its runtime (adapter.runtime)`);
  else if (reported.name !== expected) problems.push(`the results file names runtime ${reported.name}, not ${expected}`);

  const expectedAdapter = entry === 'core' ? 'zodiacs-engine-core' : 'zodiacs-engine';
  const adapterName = runtime.results.adapter?.name;
  if (adapterName !== expectedAdapter) problems.push(`the results file names adapter ${adapterName}, expected ${expectedAdapter}`);
  const nodeAdapter = node.results.adapter?.name;
  if (runtime !== node && nodeAdapter !== expectedAdapter) problems.push(`the Node reference names adapter ${nodeAdapter}, expected ${expectedAdapter}`);

  // Every request id answered exactly once (every one of the suite's), in both files.
  const ids = vectors.map((vector) => vector.id);
  const resultIds = runtime.results.results.map((entry) => entry.id);
  if (resultIds.length !== ids.length || new Set(resultIds).size !== ids.length || resultIds.some((id, index) => id !== ids[index])) {
    problems.push(`the results file holds ${resultIds.length} entries (${new Set(resultIds).size} distinct) where the suite has ${ids.length} vectors`);
  }
  if (runtime.raw.answers.size !== ids.length || runtime.raw.repeated.length || ids.some((id) => !runtime.raw.answers.has(id))) {
    problems.push(`the adapter answered ${runtime.raw.answers.size} distinct ids (${runtime.raw.repeated.length} repeated) where the suite has ${ids.length}`);
  }

  const nodeVerdicts = new Map(node.results.results.map((entry) => [entry.id, entry]));
  const verdicts = new Map(runtime.results.results.map((entry) => [entry.id, entry]));
  const differs = [];
  const largest = {};
  let agreeing = 0;
  let identicalOutputs = 0;
  let comparedOutputs = 0;
  for (const vector of vectors) {
    const mine = verdicts.get(vector.id);
    const theirs = nodeVerdicts.get(vector.id);
    const answer = runtime.raw.answers.get(vector.id);
    const nodeAnswer = node.raw.answers.get(vector.id);
    if (mine && theirs && mine.verdict !== theirs.verdict) {
      // Host zone data may move a judged answer between pass and fail; an
      // error or an unsupported answer there is the engine's, and is gated.
      const judged = (verdict) => verdict === 'pass' || verdict === 'fail';
      const hostData = dependsOnHostZoneData(vector) && judged(mine.verdict) && judged(theirs.verdict);
      differs.push({
        id: vector.id,
        kind: vector.kind,
        input: vector.input,
        node: theirs.verdict,
        runtime: mine.verdict,
        class: hostData ? 'host data' : 'engine',
        ...(hostData ? { hostTzdb: reported?.intlTzdb ?? 'not exposed', nodeTzdb: node.results.adapter?.runtime?.intlTzdb ?? 'not exposed' } : {}),
        expected: vector.expected,
        tolerance: vector.tolerance,
        nodeOutput: nodeAnswer?.output ?? null,
        runtimeOutput: answer?.output ?? null,
        ...(mine.detail ? { detail: mine.detail } : {}),
      });
    }
    if (mine && mine.verdict === theirs?.verdict && mine.verdict !== 'unsupported') agreeing += 1;
    if (!answer?.output || !nodeAnswer?.output) continue;
    comparedOutputs += 1;
    if (JSON.stringify(answer.output) === JSON.stringify(nodeAnswer.output)) identicalOutputs += 1;
    for (const [field, rule] of Object.entries(vector.tolerance)) {
      if (!(field in answer.output) || !(field in nodeAnswer.output)) continue;
      const difference = fieldDifference(rule, nodeAnswer.output[field], answer.output[field]);
      const kind = (largest[vector.kind] ??= {});
      const entry = (kind[field] ??= { unit: valueUnit(rule), compared: 0, identical: 0, maxAbs: null, at: null });
      entry.compared += 1;
      if (difference.identical) entry.identical += 1;
      if (difference.abs !== null && (entry.maxAbs === null || difference.abs > entry.maxAbs)) {
        entry.maxAbs = difference.abs;
        entry.at = vector.id;
      }
    }
  }
  for (const fields of Object.values(largest)) {
    for (const entry of Object.values(fields)) {
      if (entry.unit === 'deg' && entry.maxAbs !== null) entry.maxAbsArcsec = entry.maxAbs * 3600;
      if (entry.maxAbs === null) {
        delete entry.maxAbs;
        delete entry.at;
      }
    }
  }

  const nodeReceipts = new Map(node.receipts.map((one) => [one.id, one]));
  const receipts = runtime.receipts.map((one) => {
    const theirs = nodeReceipts.get(one.id);
    if (one.error || !theirs?.text) return { id: one.id, error: one.error ?? 'Node computed no receipt', sameAsNode: false };
    const digest = sha256(one.text);
    return { id: one.id, sha256: digest, sameAsNode: digest === sha256(theirs.text) };
  });

  const engineDiffers = differs.filter((one) => one.class === 'engine');
  for (const one of engineDiffers) problems.push(`${one.id}: ${one.runtime} where Node's verdict is ${one.node}`);
  const { total, byLevel } = runtime.results.summary;
  return {
    runtime: reported,
    engineVersion: runtime.results.adapter?.engineVersion ?? null,
    adapter: { name: runtime.results.adapter?.name ?? null, version: runtime.results.adapter?.version ?? null },
    vectors: runtime.results.vectors,
    verdicts: { total, byLevel },
    requests: { suite: ids.length, answered: runtime.raw.answers.size, repeated: runtime.raw.repeated },
    agreement: { run: runtime.raw.answers.size, agreeing, disagreeing: differs.length, unsupported: total.unsupported },
    differsFromNode: differs,
    largestDifferenceFromNode: largest,
    outputsIdenticalToNode: { identical: identicalOutputs, compared: comparedOutputs },
    receipts: { allSameAsNode: receipts.length === node.receipts.length && receipts.every((one) => one.sameAsNode), cases: receipts },
    gate: {
      pass: problems.length === 0,
      rule: 'fails when a verdict differs from Node\'s, except pass against fail on a vector that depends on host zone data, or when the run is incomplete or names another runtime or entry; differences in value and receipt digests are reported, not gated',
      problems,
    },
  };
}
