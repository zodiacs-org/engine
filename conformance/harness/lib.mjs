/*
 * The conformance suite's shared code: the vector files, their validation
 * against SPEC.md, the tolerance comparison, and the adapter protocol.
 * No dependencies beyond Node.js (20 or later).
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const SUITE = 'zodiacs-conformance';
export const SUITE_VERSION = '0.2.0';
export const SUITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Each release's vector files. A released file never changes. 0.2.0 releases
 * 0.1.0's vectors again, each naming its kind and its arbiter as ids of the
 * Zodiacs conventions registry (`conventionIds`, SPEC.md).
 */
export const RELEASES = Object.freeze({
  '0.1.0': Object.freeze({
    L1: 'vectors/L1-positions.json',
    L2: 'vectors/L2-houses-angles.json',
    L3: 'vectors/L3-time-calendars.json',
  }),
  '0.2.0': Object.freeze({
    L1: 'vectors/0.2.0/L1-positions.json',
    L2: 'vectors/0.2.0/L2-houses-angles.json',
    L3: 'vectors/0.2.0/L3-time-calendars.json',
  }),
});
/** This version's files, which the harness runs. */
export const LEVEL_FILES = RELEASES[SUITE_VERSION];
/** Each released file's SHA-256, fixed when it was released; validate.mjs checks them. */
export const RELEASE_DIGESTS = Object.freeze({
  '0.1.0': Object.freeze({
    L1: '853486bd33ddf2c136581803aec7df4b069c00f63678861537b2c0b86127366c',
    L2: '5718690f184f8bb9c1f38056c1bd11ec71a4aebf3f945a4dd519501ef33f50d0',
    L3: '434365354095524646f68423634f0b07a05333c702fc02227fd7fd1bccb0e4c8',
  }),
  '0.2.0': Object.freeze({
    L1: '4e45a5267d806a38624c6cc1eb29dd66229e5ec908fd87de9e1ec69459bb84b8',
    L2: 'fc5321b9061b9860bfb9af5254e5813be1c4bc3c858df6f623ea1617b76b88e5',
    L3: '51a367f9a2e0de7394101204f2e6a6408d1401fbefffb96cc2120d373136be66',
  }),
});

/** The v0 kinds: the level each belongs to, its input keys, and the allowed shapes of `expected`. */
export const KINDS = Object.freeze({
  'position.apparent.ecliptic-true-of-date': {
    level: 'L1', input: ['body', 'jd_tt'], optional: [], expected: [['lon', 'lat']],
  },
  'angles.asc-mc': {
    level: 'L2', input: ['jd_ut1', 'lat', 'lon'], optional: ['jd_tt'], expected: [['asc', 'mc']],
  },
  'angles.vertex-east-point': {
    level: 'L2', input: ['jd_ut1', 'lat', 'lon'], optional: ['jd_tt'], expected: [['vertex', 'east_point']],
  },
  'houses.cusps': {
    level: 'L2', input: ['jd_ut1', 'lat', 'lon', 'system'], optional: ['jd_tt'], expected: [['cusps'], ['status']],
  },
  'time.zone-offset': {
    level: 'L3', input: ['zone', 'local'], optional: [],
    expected: [['status', 'utc_offset_s'], ['status', 'utc_offsets_s'], ['status']],
  },
  'time.local-mean-time': {
    level: 'L3', input: ['lon'], optional: [], expected: [['utc_offset_s']],
  },
  'time.tt-minus-utc': {
    level: 'L3', input: ['utc'], optional: [], expected: [['tt_minus_utc_s']],
  },
  'time.delta-t': {
    level: 'L3', input: ['jd_ut1'], optional: ['utc'], expected: [['delta_t_s']],
  },
  'calendar.to-jdn': {
    level: 'L3', input: ['calendar', 'year', 'month', 'day'], optional: [], expected: [['jdn']],
  },
  'calendar.from-jdn': {
    level: 'L3', input: ['calendar', 'jdn'], optional: [], expected: [['year', 'month', 'day']],
  },
});

export const BODIES = Object.freeze(['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']);
export const SYSTEMS = Object.freeze([
  'placidus', 'koch', 'regiomontanus', 'campanus', 'porphyry', 'alcabitius', 'equal',
  'whole-sign', 'morinus', 'meridian', 'topocentric', 'vehlow', 'equal-mc',
]);
const UNITS = Object.freeze({ arcsec: 3600, deg: 1, s: 1 });
const SWISS = /swiss|swisseph|sweph|pyswisseph/iu;

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function readLevel(level, root = SUITE_DIR, version = SUITE_VERSION) {
  const path = resolve(root, RELEASES[version][level]);
  const bytes = readFileSync(path);
  return { level, version, path, digest: sha256(bytes), file: JSON.parse(bytes.toString('utf8')) };
}

/** Every level file of a release that exists, in level order; by default each level that release has. */
export function readSuite(root = SUITE_DIR, levels = undefined, version = SUITE_VERSION) {
  return (levels ?? Object.keys(RELEASES[version]))
    .filter((level) => existsSync(resolve(root, RELEASES[version][level])))
    .map((level) => readLevel(level, root, version));
}

/** The registry ids a vector names from 0.2.0: its kind and its arbiter, sorted. */
export const conventionIds = (vector) => [`arbiter:${vector.arbiter}`, `kind:${vector.kind}`].sort();

const sameKeys = (keys, shape) => keys.length === shape.length && shape.every((key) => keys.includes(key));

function validateRule(rule, where, problems) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    problems.push(`${where}: tolerance rule must be an object`);
    return;
  }
  if ('each' in rule) {
    if (Object.keys(rule).length !== 1) problems.push(`${where}: "each" stands alone`);
    validateRule(rule.each, `${where}.each`, problems);
    return;
  }
  if ('exact' in rule) {
    if (rule.exact !== true || Object.keys(rule).length !== 1) problems.push(`${where}: exact rule is { "exact": true }`);
    return;
  }
  if (!(typeof rule.abs === 'number' && rule.abs >= 0 && Number.isFinite(rule.abs))) problems.push(`${where}: abs must be a finite number ≥ 0`);
  if (!(rule.unit in UNITS)) problems.push(`${where}: unit must be one of ${Object.keys(UNITS).join(', ')}`);
  if ('wrap' in rule && rule.wrap !== 360) problems.push(`${where}: wrap must be 360`);
  for (const key of Object.keys(rule)) {
    if (!['abs', 'unit', 'wrap'].includes(key)) problems.push(`${where}: unknown tolerance key ${key}`);
  }
}

/** Problems with one level file of a release, per SPEC.md; an empty list means it conforms. */
export function validateLevel({ level, file, version = SUITE_VERSION }, root = SUITE_DIR) {
  const problems = [];
  const where = RELEASES[version][level];
  const named = version !== '0.1.0';
  if (file.suite !== SUITE) problems.push(`${where}: suite must be ${SUITE}`);
  if (file.suiteVersion !== version) problems.push(`${where}: suiteVersion must be ${version}`);
  if (file.level !== level) problems.push(`${where}: level must be ${level}`);
  if (typeof file.title !== 'string' || !file.title.trim()) problems.push(`${where}: title is required`);
  const arbiters = file.arbiters ?? {};
  if (!Object.keys(arbiters).length) problems.push(`${where}: no arbiters`);
  for (const [id, arbiter] of Object.entries(arbiters)) {
    const at = `${where} arbiter ${id}`;
    if (SWISS.test(id) || SWISS.test(arbiter.name ?? '')) problems.push(`${at}: Swiss Ephemeris may not be an arbiter`);
    for (const field of ['name', 'source', 'method', 'generator', 'uncertainty']) {
      if (typeof arbiter[field] !== 'string' || !arbiter[field].trim()) problems.push(`${at}: ${field} is required`);
    }
    if (!Array.isArray(arbiter.inputs)) problems.push(`${at}: inputs must be an array`);
    for (const input of arbiter.inputs ?? []) {
      if (input.url !== undefined && input.path === undefined) {
        // A published file the generator downloads and checks; not committed.
        if (!/^https:\/\/\S+$/u.test(input.url)) problems.push(`${at}: input url ${input.url} must be an https URL`);
        if (!/^[0-9a-f]{64}$/u.test(input.sha256 ?? '')) problems.push(`${at}: input ${input.url} needs a sha256`);
        continue;
      }
      const path = resolve(root, input.path ?? '');
      if (!input.path || !existsSync(path)) problems.push(`${at}: input ${input.path} is missing`);
      else if (sha256(readFileSync(path)) !== input.sha256) problems.push(`${at}: input ${input.path} does not match its sha256`);
    }
    if (arbiter.generator && !existsSync(resolve(root, arbiter.generator))) problems.push(`${at}: generator ${arbiter.generator} is missing`);
  }
  const ids = new Set();
  const used = new Set();
  for (const [index, vector] of (file.vectors ?? []).entries()) {
    const at = `${where} vector ${vector.id ?? `#${index}`}`;
    if (typeof vector.id !== 'string' || !new RegExp(`^${level}-[A-Z]+-\\d{4}$`, 'u').test(vector.id)) problems.push(`${at}: id must be ${level}-<TAG>-<4 digits>`);
    if (ids.has(vector.id)) problems.push(`${at}: duplicate id`);
    ids.add(vector.id);
    const kind = KINDS[vector.kind];
    if (!kind) {
      problems.push(`${at}: unknown kind ${vector.kind}`);
      continue;
    }
    if (kind.level !== level) problems.push(`${at}: kind ${vector.kind} belongs to ${kind.level}`);
    const inputKeys = Object.keys(vector.input ?? {});
    for (const key of kind.input) if (!inputKeys.includes(key)) problems.push(`${at}: input.${key} is required`);
    for (const key of inputKeys) if (!kind.input.includes(key) && !kind.optional.includes(key)) problems.push(`${at}: unexpected input.${key}`);
    const expectedKeys = Object.keys(vector.expected ?? {});
    if (!kind.expected.some((shape) => sameKeys(expectedKeys, shape))) problems.push(`${at}: expected has keys ${expectedKeys.join(', ')}`);
    if (!vector.tolerance || typeof vector.tolerance !== 'object') problems.push(`${at}: tolerance is required`);
    for (const [key, rule] of Object.entries(vector.tolerance ?? {})) {
      if (!expectedKeys.includes(key)) problems.push(`${at}: tolerance for ${key}, which is not expected`);
      validateRule(rule, `${at} tolerance.${key}`, problems);
    }
    for (const key of expectedKeys) {
      if (!(key in (vector.tolerance ?? {}))) problems.push(`${at}: expected.${key} has no tolerance entry`);
    }
    if (vector.tags !== undefined && !(Array.isArray(vector.tags) && vector.tags.length && vector.tags.every((tag) => typeof tag === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/u.test(tag)))) problems.push(`${at}: tags must be a non-empty array of lowercase-hyphenated strings`);
    for (const key of Object.keys(vector)) {
      if (!['id', 'kind', 'input', 'expected', 'tolerance', 'arbiter', 'note', 'tags', ...(named ? ['conventionIds'] : [])].includes(key)) problems.push(`${at}: unknown key ${key}`);
    }
    if (named && JSON.stringify(vector.conventionIds) !== JSON.stringify(conventionIds(vector))) problems.push(`${at}: conventionIds must be ${JSON.stringify(conventionIds(vector))}`);
    if (typeof vector.arbiter !== 'string' || !arbiters[vector.arbiter]) problems.push(`${at}: arbiter ${vector.arbiter} is not listed`);
    else used.add(vector.arbiter);
    if (vector.kind === 'position.apparent.ecliptic-true-of-date' && !BODIES.includes(vector.input?.body)) problems.push(`${at}: unknown body ${vector.input?.body}`);
    if (vector.kind === 'houses.cusps' && !SYSTEMS.includes(vector.input?.system)) problems.push(`${at}: unknown system ${vector.input?.system}`);
    if (Array.isArray(vector.expected?.cusps) && vector.expected.cusps.length !== 12) problems.push(`${at}: cusps must have 12 entries`);
  }
  for (const id of Object.keys(arbiters)) if (!used.has(id)) problems.push(`${where}: arbiter ${id} is not used by any vector`);
  return problems;
}

/**
 * Problems with a level file that releases an earlier one's vectors again:
 * the same file, but for its suite version and each vector's conventionIds.
 */
export function compareRelease(current, released) {
  const at = `${RELEASES[current.version][current.level]} against ${RELEASES[released.version][released.level]}`;
  const strip = (file) => ({ ...file, suiteVersion: undefined, vectors: file.vectors.map(({ conventionIds: _ids, ...vector }) => vector) });
  const now = strip(current.file);
  const then = strip(released.file);
  const problems = [];
  if (JSON.stringify({ ...now, vectors: undefined }) !== JSON.stringify({ ...then, vectors: undefined })) problems.push(`${at}: the file differs beyond its suite version`);
  if (now.vectors.length !== then.vectors.length) problems.push(`${at}: ${now.vectors.length} vectors where ${then.vectors.length} were released`);
  now.vectors.forEach((vector, index) => {
    if (JSON.stringify(vector) !== JSON.stringify(then.vectors[index])) problems.push(`${at}: ${vector.id} differs from released ${then.vectors[index]?.id ?? 'nothing'}`);
  });
  return problems;
}

/** The signed difference actual − expected, on the circle when the rule wraps, in the rule's unit. */
function difference(rule, expected, actual) {
  let delta = actual - expected;
  if (rule.wrap) {
    delta %= rule.wrap;
    if (delta > rule.wrap / 2) delta -= rule.wrap;
    if (delta <= -rule.wrap / 2) delta += rule.wrap;
  }
  return delta * UNITS[rule.unit];
}

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Compare one field; returns { pass, residual? } with the residual in the rule's unit. */
export function compareField(rule, expected, actual) {
  if (!rule || rule.exact) return { pass: deepEqual(expected, actual) };
  if (rule.each) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) return { pass: false };
    let pass = true;
    let worst;
    for (let index = 0; index < expected.length; index += 1) {
      const one = compareField(rule.each, expected[index], actual[index]);
      pass &&= one.pass;
      if (one.residual !== undefined && (worst === undefined || Math.abs(one.residual) > Math.abs(worst))) worst = one.residual;
    }
    return worst === undefined ? { pass } : { pass, residual: worst };
  }
  if (typeof actual !== 'number' || !Number.isFinite(actual)) return { pass: false };
  const residual = difference(rule, expected, actual);
  return { pass: Math.abs(residual) <= rule.abs, residual };
}

const tidy = (value) => Number(value.toPrecision(9));

/** A vector's verdict for one adapter response. */
export function judge(vector, response) {
  if (!response) return { verdict: 'error', detail: 'no response' };
  if (typeof response.unsupported === 'string') return { verdict: 'unsupported', detail: response.unsupported };
  if (typeof response.error === 'string') return { verdict: 'error', detail: response.error };
  const output = response.output;
  if (!output || typeof output !== 'object') return { verdict: 'error', detail: 'response has no output' };
  let pass = true;
  const residual = {};
  const missing = [];
  for (const [key, expected] of Object.entries(vector.expected)) {
    if (!(key in output)) {
      pass = false;
      missing.push(key);
      continue;
    }
    const one = compareField(vector.tolerance[key], expected, output[key]);
    pass &&= one.pass;
    if (one.residual !== undefined) residual[key] = tidy(one.residual);
  }
  const result = { verdict: pass ? 'pass' : 'fail' };
  if (Object.keys(residual).length) result.residual = residual;
  if (missing.length) result.detail = `output lacks ${missing.join(', ')}`;
  return result;
}

/**
 * Run an adapter over the vectors. Resolves with { adapter, responses } where
 * responses maps vector id to the adapter's response line.
 */
export function runAdapter(command, vectors, { timeoutMs = 15 * 60_000, cwd = process.cwd() } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, { shell: true, cwd, stdio: ['pipe', 'pipe', 'inherit'] });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const responses = new Map();
    let adapter = null;
    let failed = false;
    const fail = (error) => {
      if (failed) return;
      failed = true;
      child.kill('SIGKILL');
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error(`adapter did not finish within ${timeoutMs} ms`)), timeoutMs);
    // An adapter that exits early closes its input; the close handler reports it.
    child.stdin.on('error', () => {});
    lines.on('line', (line) => {
      if (!line.trim()) return;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        fail(new Error(`adapter wrote a line that is not JSON: ${line.slice(0, 200)}`));
        return;
      }
      if (adapter === null) {
        if (!message.adapter || typeof message.adapter !== 'object') {
          fail(new Error('the adapter must first write {"adapter": {...}}'));
          return;
        }
        adapter = message.adapter;
        for (const vector of vectors) child.stdin.write(`${JSON.stringify({ id: vector.id, kind: vector.kind, input: vector.input })}\n`);
        child.stdin.end();
        return;
      }
      const expectedId = vectors[responses.size]?.id;
      if (message.id !== expectedId) {
        fail(new Error(`adapter answered ${message.id} where ${expectedId} was due`));
        return;
      }
      responses.set(message.id, message);
    });
    child.on('error', fail);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failed) return;
      if (adapter === null) fail(new Error('the adapter must first write {"adapter": {...}}; it exited without one'));
      else if (code !== 0) fail(new Error(`adapter exited with status ${code}`));
      else if (responses.size !== vectors.length) fail(new Error(`adapter answered ${responses.size} of ${vectors.length} requests`));
      else resolvePromise({ adapter, responses });
    });
  });
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
const median = (sorted) => (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);

/** Counts per level and kind, and residual statistics per kind and field. */
export function summarize(vectors, results) {
  const byId = new Map(results.map((result) => [result.id, result]));
  const blank = () => ({ count: 0, pass: 0, fail: 0, unsupported: 0, error: 0 });
  const total = blank();
  const byLevel = {};
  const byKind = {};
  const byTag = {};
  const residuals = {};
  for (const vector of vectors) {
    const result = byId.get(vector.id);
    const level = KINDS[vector.kind].level;
    byLevel[level] ??= blank();
    byKind[vector.kind] ??= blank();
    const buckets = [total, byLevel[level], byKind[vector.kind]];
    for (const tag of vector.tags ?? []) buckets.push((byTag[tag] ??= blank()));
    for (const bucket of buckets) {
      bucket.count += 1;
      bucket[result.verdict] += 1;
    }
    for (const [field, value] of Object.entries(result.residual ?? {})) {
      const rule = vector.tolerance[field]?.each ?? vector.tolerance[field];
      const key = `${vector.kind}\u0000${field}`;
      residuals[key] ??= { kind: vector.kind, field, unit: rule.unit, values: [] };
      residuals[key].values.push(Math.abs(value));
    }
  }
  for (const entry of Object.values(residuals)) {
    const sorted = entry.values.sort((a, b) => a - b);
    byKind[entry.kind].residuals ??= {};
    byKind[entry.kind].residuals[entry.field] = {
      unit: entry.unit,
      n: sorted.length,
      median: tidy(median(sorted)),
      p95: tidy(percentile(sorted, 0.95)),
      max: tidy(sorted.at(-1)),
    };
  }
  return { total, byLevel, byKind, byTag };
}
