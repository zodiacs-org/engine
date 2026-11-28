import { createHistogram } from 'node:perf_hooks';

// Invented instants and places, with no connection to anyone's birth data.
const birth = { utc: '2001-02-03T04:05:06.789Z', latitude: 23.45, longitude: -67.89 };
const at = '2024-06-07T08:09:10+02:00';
export const WORKLOADS = [
  { name: 'natal', path: '/v1/natal', body: birth, scopes: ['/data'] },
  { name: 'transits', path: '/v1/transits', body: { natal: birth, at }, scopes: ['/data/natal', '/data/sky'] },
  { name: 'synastry', path: '/v1/synastry', body: { a: birth, b: { utc: '2003-07-08T09:10:11Z', timeKnown: false } }, scopes: ['/data/a', '/data/b'] },
  { name: 'solar', path: '/v1/returns/solar', body: { natal: birth, at, selection: 'most-recent', location: null }, scopes: ['/data/natal', '/data/chart'] },
  { name: 'lunar', path: '/v1/returns/lunar', body: { natal: birth, after: at, location: null }, scopes: ['/data/natal', '/data/chart'] },
  { name: 'moon-phase', path: '/v1/moon-phase', body: { at }, scopes: ['/data/sky'] },
  { name: 'houses', path: '/v1/houses', body: { time: { iso: '2004-02-29T08:30:00+02:00', deltaT: 70 }, place: { latitude: 48.25, longitude: -3.75 }, houseSystem: 'placidus' }, scopes: ['/data'] },
];

export function check(condition, message) {
  if (!condition) throw new Error(message);
}

export function readOptions(args) {
  const options = { duration: 10, warmup: 2, connections: [1, 4], repetitions: 1, routes: WORKLOADS.map(({ name }) => name) };
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]?.replace(/^--/u, '');
    const value = args[i + 1];
    check(args[i] === `--${name}` && Object.hasOwn(options, name) && !seen.has(name) && value,
      'Invalid load option. Use --duration, --warmup, --connections, --repetitions or --routes with a value.');
    seen.add(name);
    if (name === 'routes') {
      options.routes = value.split(',');
      check(options.routes.every((route) => WORKLOADS.some(({ name }) => name === route))
        && new Set(options.routes).size === options.routes.length, 'Invalid load routes.');
    } else {
      const numbers = value.split(',');
      const [minimum, maximum] = { duration: [1, 60], warmup: [1, 30], connections: [1, 8], repetitions: [1, 5] }[name];
      check(numbers.every((number) => /^[1-9][0-9]*$/u.test(number) && Number(number) >= minimum && Number(number) <= maximum)
        && new Set(numbers).size === numbers.length && (name === 'connections' || numbers.length === 1), 'Invalid load option range.');
      options[name] = name === 'connections' ? numbers.map(Number) : Number(value);
    }
  }
  return options;
}

export function verifyResponse(text, workload, engine) {
  const sameEngine = (actual) => actual?.name === engine.name && actual?.version === engine.version
    && actual?.ephemeris?.name === engine.ephemeris.name && actual?.ephemeris?.version === engine.ephemeris.version;
  try {
    const body = JSON.parse(text);
    if (body.error || !body.data || typeof body.requestId !== 'string'
      || !sameEngine(body.engine)
      || !Array.isArray(body.receipts) || body.receipts.length !== workload.scopes.length) return false;
    return workload.scopes.every((scope, index) => {
      const scoped = body.receipts[index];
      const covered = scope.split('/').slice(1).reduce((value, key) => value?.[key], body);
      if (scoped?.scope !== scope || !covered) return false;
      if (workload.name === 'houses') {
        const receipt = scoped.receipt;
        return typeof receipt?.schema === 'string' && receipt.request && typeof receipt.request === 'object'
          && sameEngine(receipt.engine)
          && Array.isArray(receipt.instants) && receipt.instants.length > 0
          && Array.isArray(receipt.conventions) && receipt.conventions.length > 0
          && JSON.stringify(receipt) === JSON.stringify(covered.receipt);
      }
      return typeof scoped.envelope?.schema === 'string' && typeof scoped.envelope?.receipt?.schema === 'string'
        && sameEngine(scoped.envelope.receipt.engine)
        && scoped.envelope.result && typeof scoped.envelope.result === 'object' && Array.isArray(covered.bodies);
    });
  } catch { return false; }
}

export function observations() {
  // Bounded HDR histogram, nanoseconds with three significant digits. The
  // response event uses milliseconds; ceil never rounds an observation down.
  const histogram = createHistogram({ lowest: 1, highest: 60_000_000_000, figures: 3 });
  const statuses = {};
  let invalidTimings = 0;
  return {
    histogram, statuses,
    get invalidTimings() { return invalidTimings; },
    record(status, milliseconds) {
      statuses[status] = (statuses[status] ?? 0) + 1;
      if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 60_000) invalidTimings++;
      else histogram.record(Math.max(1, Math.ceil(milliseconds * 1_000_000)));
    },
  };
}

export function clientKeySetup(keys) {
  let index = 0;
  return (client) => {
    check(index < keys.length, 'Insufficient load client keys.');
    client.setHeaders({ authorization: `Bearer ${keys[index++]}`, 'content-type': 'application/json' });
  };
}

export function summarize(result, observed, { durationSeconds, requestedDurationSeconds }) {
  const statusCounts = Object.fromEntries(Object.entries(result.statusCodeStats).map(([code, value]) => [code, value.count]));
  const completed = Object.values(statusCounts).reduce((sum, value) => sum + value, 0);
  const count = observed.histogram.count;
  check(Number.isFinite(result.duration) && result.duration > 0
    && Number.isFinite(durationSeconds) && durationSeconds > 0
    && Number.isFinite(requestedDurationSeconds) && requestedDurationSeconds > 0
    && Number.isSafeInteger(completed) && completed > 0
    && Number.isSafeInteger(result.requests.sent) && result.requests.sent >= completed
    && completed === result.requests.total && completed === count
    && JSON.stringify(statusCounts) === JSON.stringify(observed.statuses)
    && observed.invalidTimings === 0 && observed.histogram.exceeds === 0, 'Incomplete load measurements.');
  // Only aggregate whitelisted fields. Never serialize autocannon options,
  // request headers, response bodies, URLs, child output or arbitrary errors.
  const summary = {
    passed: Object.keys(statusCounts).length === 1 && statusCounts['200'] === completed
      && result.errors === 0 && result.timeouts === 0 && result.mismatches === 0 && result.non2xx === 0,
    startedAt: result.start.toISOString(), finishedAt: result.finish.toISOString(),
    durationSeconds, requestedDurationSeconds, autocannonDurationSeconds: result.duration,
    sent: result.requests.sent, completed,
    unfinishedAtStop: result.requests.sent - completed,
    successfulResponsesPerSecond: (statusCounts['200'] ?? 0) / durationSeconds,
    statusCounts, errors: result.errors, timeouts: result.timeouts,
    bodyMismatches: result.mismatches, non2xx: result.non2xx,
    latencyMs: { samples: count, p50: observed.histogram.percentile(50) / 1_000_000,
      p95: observed.histogram.percentile(95) / 1_000_000, max: observed.histogram.max / 1_000_000 },
  };
  return summary;
}
