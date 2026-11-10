import { spawn } from 'node:child_process';
import { isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';

const PROTOCOL = 'zodiacs.qualification.worker.v1';
const BODIES = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const UTC = '2000-01-01T12:00:00.000Z';
const base = { utc: UTC, deltaT: 69, timeKnown: false };

/** Finite public-contract checks, not exhaustive API conformance or an accuracy oracle. */
export const DEFAULT_PROBES = freeze([
  { id: 'reject-impossible-calendar-date', kind: 'reject', input: { utc: '2001-02-29T12:00:00Z' } },
  { id: 'reject-ambiguous-timezone', kind: 'reject', input: { utc: '2000-01-01T12:00:00' } },
  { id: 'reject-missing-instant', kind: 'reject', input: {} },
  { id: 'reject-unpaired-coordinate', kind: 'reject', input: { ...base, latitude: 40 } },
  { id: 'reject-invalid-latitude', kind: 'reject', input: { ...base, latitude: 91, longitude: 0 } },
  { id: 'reject-unknown-house-system', kind: 'reject', input: { ...base, houseSystem: 'invalid-system' } },
  { id: 'reject-nonnumeric-clock-pin', kind: 'reject', input: { ...base, deltaT: '69' } },
  { id: 'reject-excessive-clock-pin', kind: 'reject', input: { ...base, deltaT: 1e11 } },
  { id: 'unknown-time-suppresses-houses', kind: 'unknown-time', input: { ...base, latitude: 40.7, longitude: -74, houseSystem: 'placidus' } },
  { id: 'exact-time-requested-houses', kind: 'located', input: { ...base, timeKnown: true, latitude: 40.7, longitude: -74, houseSystem: 'whole' } },
  { id: 'repeated-geometry-deterministic', kind: 'repeat', input: base },
  { id: 'clock-pin-honor-and-isolation', kind: 'clock', input: base, alternatePin: 3600 }
]);

export const DEFAULT_LIMITS = freeze({ timeoutMs: 30000, memoryMb: 256, maxInputBytes: 1048576, maxOutputBytes: 2097152, maxStderrBytes: 65536 });
const MAX_LIMITS = { timeoutMs: 600000, memoryMb: 4096, maxInputBytes: 16777216, maxOutputBytes: 16777216, maxStderrBytes: 1048576 };
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const check = (condition, message) => { if (!condition) throw new TypeError(message); };
const finite = v => typeof v === 'number' && Number.isFinite(v);
const goodLon = v => finite(v) && v >= 0 && v < 360;
const goodLat = v => finite(v) && Math.abs(v) <= 90;
const short = value => String(value?.message ?? value).slice(0, 4096);
function jsonValue(value, depth = 0) {
  check(depth <= 32, 'JSON value too deeply nested');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { check(Number.isFinite(value), 'Nonfinite JSON number'); return; }
  check(Array.isArray(value) || record(value), 'Non-JSON value');
  Object.values(value).forEach(v => jsonValue(v, depth + 1));
}
function validateApi(api) {
  check(record(api), 'Missing API metadata');
  check(api.engineVersion === null || typeof api.engineVersion === 'string', 'Invalid engine version');
  check(api.ephemeris === null || (record(api.ephemeris) && typeof api.ephemeris.name === 'string' && typeof api.ephemeris.version === 'string'), 'Invalid ephemeris declaration');
  for (const key of ['exportNames','functionExportNames']) {
    check(Array.isArray(api[key]) && api[key].length <= 4096 && api[key].every(v => typeof v === 'string') && new Set(api[key]).size === api[key].length, 'Invalid export names');
  }
  check(api.functionExportNames.every(n => api.exportNames.includes(n)), 'Function absent from export names');
  check(api.aspectPolicy === null || Array.isArray(api.aspectPolicy) || record(api.aspectPolicy), 'Invalid aspect policy');
  jsonValue(api);
}
function statistics(values) {
  if (!values.length) return { count: 0, median: null, p95: null, max: null };
  const sorted = [...values].sort((a,b) => a-b), n = sorted.length;
  return { count: n, median: n % 2 ? sorted[(n-1)/2] : (sorted[n/2-1]+sorted[n/2])/2, p95: sorted[Math.ceil(.95*n)-1], max: sorted[n-1] };
}
const groupKey = c => JSON.stringify([Date.parse(c.utc), c.deltaT]);

/** Run trusted local code with bounded transport, wall time and V8 heap. NOT an OS sandbox.
 * Configuration errors throw; candidate/process failures return a complete error denominator.
 * `completed` means a complete transport, not passing rows, probes or qualification.
 */
export async function executeEngine({ entry, cases, probes = DEFAULT_PROBES, limits = {} } = {}) {
  check(typeof entry === 'string' && isAbsolute(entry), 'entry must be an absolute local module path');
  check(Array.isArray(cases) && cases.length > 0 && cases.length <= 4096, 'cases must contain 1..4096 entries');
  const ids = new Set(), groups = new Map(), caseGroups = new Map(), caseMap = new Map();
  for (const c of cases) {
    check(record(c) && typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 512 && !ids.has(c.id), 'Invalid/duplicate case ID');
    check(BODIES.includes(c.body), 'Invalid physical body');
    check(typeof c.utc === 'string' && /^([+-]\d{6}|\d{4})-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(Z|[+-]\d\d:\d\d)$/.test(c.utc) && finite(Date.parse(c.utc)), 'Invalid explicit UTC instant');
    check(finite(c.deltaT) && Math.abs(c.deltaT) <= 1e10, 'Invalid clock pin');
    ids.add(c.id);
    const key = groupKey(c);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c.id); caseGroups.set(c.id, key);
    caseMap.set(c.id, {id:c.id,body:c.body,utc:c.utc,deltaT:c.deltaT});
  }
  cases = [...caseMap.values()];
  check(Array.isArray(probes) && probes.length <= DEFAULT_PROBES.length, 'Invalid probe list');
  const probeMap = new Map();
  for (const p of probes) {
    const expected = DEFAULT_PROBES.find(e => e.id === p?.id);
    check(expected && isDeepStrictEqual(expected, p) && !probeMap.has(p.id), 'Only frozen default probes or their subsets are supported');
    probeMap.set(p.id, p);
  }
  check(record(limits), 'Invalid limits');
  check(Object.keys(limits).every(k => Object.hasOwn(MAX_LIMITS, k)), 'Unknown limit');
  const bounded = { ...DEFAULT_LIMITS, ...limits };
  for (const [key, v] of Object.entries(bounded)) check(Number.isInteger(v) && v > 0 && v <= MAX_LIMITS[key], 'Invalid limit: ' + key);
  check(bounded.memoryMb >= 16, 'memoryMb must be at least 16');
  const input = JSON.stringify({ protocol: PROTOCOL, entry, cases: cases.map(({id,body,utc,deltaT}) => ({id,body,utc,deltaT})), probes });
  check(Buffer.byteLength(input) <= bounded.maxInputBytes, 'Worker input exceeds byte limit');
  const started = performance.now();
  return new Promise(resolve => {
    const rowMap = new Map(), observedProbes = new Map(), seenGroups = new Set(), times = [];
    let api = { engineVersion: null, ephemeris: null, exportNames: [], functionExportNames: [], aspectPolicy: null };
    let startupMs = null, ready = false, done = false, reason = null, timedOut = false, bytes = 0, stderrBytes = 0, stderr = '', pending = Buffer.alloc(0), settled = false;
    const child = spawn(process.execPath, [`--max-old-space-size=${bounded.memoryMb}`, fileURLToPath(new URL('./worker.mjs', import.meta.url)), String(bounded.maxInputBytes)], {
      cwd: dirname(entry), shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe','pipe','pipe'],
      env: { PATH: process.env.PATH ?? '', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' }
    });
    function kill() {
      if (!child.pid) return;
      try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* Already exited. */ }
    }
    function abort(message, timeout = false) { if (!reason) { reason = short(message); timedOut = timeout; } kill(); }
    const timer = setTimeout(() => abort('Worker wall-time limit exceeded', true), bounded.timeoutMs);
    function frame(value) {
      check(record(value) && value.protocol === PROTOCOL && typeof value.type === 'string', 'Malformed worker frame');
      check(!done, 'Data after terminal frame');
      if (value.type === 'ready') {
        check(!ready && rowMap.size === 0, 'Duplicate/late ready frame'); validateApi(value.api);
        api = value.api; ready = true; startupMs = performance.now() - started; return;
      }
      if (value.type === 'fatal') { check(typeof value.error === 'string', 'Malformed fatal frame'); abort('Worker failure: ' + value.error); return; }
      check(ready, 'Worker results before ready');
      if (value.type === 'rows') {
        check(Array.isArray(value.rows) && value.rows.length > 0 && finite(value.elapsedMs) && value.elapsedMs >= 0, 'Invalid row frame');
        const group = caseGroups.get(value.rows[0]?.id), expected = groups.get(group);
        check(expected && !seenGroups.has(group) && expected.length === value.rows.length, 'Unexpected/duplicate chart group');
        const frameIds = new Set();
        for (const r of value.rows) {
          check(record(r) && expected.includes(r.id) && !frameIds.has(r.id) && !rowMap.has(r.id), 'Unexpected/duplicate result ID');
          const source = caseMap.get(r.id);
          check(r.body === source.body && r.utc === source.utc && r.deltaT === source.deltaT, 'Result case metadata mismatch');
          check(r.status === 'ok' || r.status === 'error', 'Invalid row status');
          if (r.status === 'ok') check(goodLon(r.lon) && goodLat(r.lat), 'Invalid result coordinates');
          else check(typeof r.error === 'string' && r.error.length > 0, 'Missing row error');
          frameIds.add(r.id);
        }
        for (const r of value.rows) rowMap.set(r.id, r.status === 'ok' ? { ...caseMap.get(r.id),status:'ok',lon:r.lon,lat:r.lat } : {...caseMap.get(r.id),status:'error',error:short(r.error)});
        seenGroups.add(group); times.push(value.elapsedMs); return;
      }
      if (value.type === 'probe') {
        const p = value.probe;
        check(record(p) && probeMap.has(p.id) && !observedProbes.has(p.id) && typeof p.passed === 'boolean' && record(p.details), 'Invalid/duplicate probe');
        jsonValue(p.details); observedProbes.set(p.id, p); return;
      }
      if (value.type === 'done') {
        check(rowMap.size === cases.length && observedProbes.size === probes.length, 'Incomplete terminal coverage'); done = true; return;
      }
      throw new TypeError('Unknown worker frame');
    }
    child.stdout.on('data', chunk => {
      if (reason) return;
      bytes += chunk.length;
      if (bytes > bounded.maxOutputBytes) return abort('Worker aggregate output byte limit exceeded');
      pending = Buffer.concat([pending, chunk]);
      try {
        let end;
        while ((end = pending.indexOf(10)) >= 0) {
          const line = pending.subarray(0,end); pending = pending.subarray(end+1);
          frame(JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(line)));
          if (reason) return;
        }
      } catch (error) { abort('Malformed worker output: ' + short(error)); }
    });
    child.stderr.on('data', chunk => {
      bytes += chunk.length; stderrBytes += chunk.length;
      if (stderr.length < 4096) stderr += chunk.toString('utf8').slice(0,4096-stderr.length);
      if (bytes > bounded.maxOutputBytes || stderrBytes > bounded.maxStderrBytes) abort('Worker output/stderr byte limit exceeded');
    });
    child.on('error', error => abort('Unable to start worker: ' + short(error)));
    child.stdin.on('error', error => { if (!done && !reason) abort('Worker input transport failed: ' + short(error)); });
    child.on('close', (code, signal) => {
      if (settled) return; settled = true; clearTimeout(timer); kill();
      if (!reason && (code !== 0 || signal)) reason = `Worker exited abnormally (code=${code}, signal=${signal})`;
      if (!reason && pending.length) reason = 'Worker output lacks terminal newline';
      if (!reason && (!ready || !done)) reason = 'Worker ended without complete protocol';
      const error = reason ? short(reason + (stderr ? '; stderr: ' + stderr : '')) : null;
      resolve({ status: timedOut ? 'timeout' : error ? 'failed' : 'completed',
        rows: cases.map(c => rowMap.get(c.id) ?? {...c,status:'error',error:error ?? 'Missing worker row'}), api,
        probes: probes.map(p => observedProbes.get(p.id) ?? {id:p.id,passed:false,details:{error:error ?? 'Missing worker probe'}}),
        timing: {startupMs,chartMs:statistics(times)}, ...(error ? {error} : {}) });
    });
    child.stdin.end(input);
  });
}
