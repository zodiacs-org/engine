import { createHash } from 'node:crypto';

export const SIGNS = Object.freeze(['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces']);
export function assert(condition, message) { if (!condition) throw new TypeError(message); }
export function finite(value, label = 'number') {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return value;
}
export function plain(value, label = 'object') {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)), `${label} must be a plain object`);
  return value;
}
export function nonempty(value, label = 'string') {
  assert(typeof value === 'string' && value.trim().length > 0 && value.length <= 2048, `${label} must be a nonempty string (max 2048)`);
  return value;
}
export function canonicalize(value) {
  const seen = new Set();
  function visit(v, depth) {
    assert(depth < 64, 'JSON nesting too deep');
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number') { finite(v); return JSON.stringify(v); }
    assert(typeof v === 'object', 'Only JSON values are supported');
    assert(!seen.has(v), 'Cyclic JSON value');
    seen.add(v);
    assert(Object.getOwnPropertySymbols(v).length === 0, 'Symbol properties are unsupported');
    for (const d of Object.values(Object.getOwnPropertyDescriptors(v))) {
      assert(!d.get && !d.set, 'Accessor properties are unsupported');
    }
    let out;
    if (Array.isArray(v)) {
      assert(Object.getPrototypeOf(v) === Array.prototype && Object.getOwnPropertyNames(v).length === v.length + 1, 'Nonstandard or decorated array');
      assert(Object.keys(v).length === v.length && Object.keys(v).every((k, i) => k === String(i)), 'Sparse or decorated array');
      const parts = [];
      for (let i = 0; i < v.length; i++) parts.push(visit(v[i], depth + 1));
      out = '[' + parts.join(',') + ']';
    } else {
      plain(v);
      assert(Object.getOwnPropertyNames(v).length === Object.keys(v).length, 'Nonenumerable JSON fields');
      out = '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + visit(v[k], depth + 1)).join(',') + '}';
    }
    seen.delete(v);
    return out;
  }
  return visit(value, 0);
}
export function digest(value) { return 'sha256:' + createHash('sha256').update(canonicalize(value)).digest('hex'); }
export function seal(payload) {
  plain(payload, 'payload');
  assert(!Object.hasOwn(payload, 'id'), 'Cannot seal an existing id');
  const copy = JSON.parse(canonicalize(payload));
  return { ...copy, id: digest(copy) };
}
export function verifySeal(value) {
  try {
    plain(value);
    canonicalize(value); // Reject getters, undefined fields and exotic objects before destructuring.
    const { id, ...payload } = value;
    return typeof id === 'string' && /^sha256:[0-9a-f]{64}$/.test(id) && digest(payload) === id;
  } catch { return false; }
}

// Strict proleptic Gregorian, millisecond-resolution, explicitly resolved instants.
// Leap seconds are rejected; this helper does not resolve civil timezones.
export function instant(value) {
  assert(typeof value === 'string', 'instant must be an ISO string');
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  assert(m, 'instant requires date, time including seconds, and explicit Z/offset');
  const [, y, mo, d, h, mi, s, fraction, offset] = m;
  const year = +y, month = +mo, day = +d;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  assert(month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1], 'invalid calendar date');
  assert(+h < 24 && +mi < 60 && +s < 60, 'invalid clock time or unsupported leap second');
  if (offset !== 'Z') {
    const oh = +offset.slice(1,3), om = +offset.slice(4,6);
    assert(oh <= 14 && om < 60 && (oh !== 14 || om === 0), 'invalid UTC offset');
    assert(offset !== '-00:00', 'unknown offset -00:00 is not a resolved instant');
  }
  const ms = Date.parse(value);
  assert(Number.isSafeInteger(ms), 'instant outside supported range');
  return ms;
}
export function normalize(value) {
  finite(value, 'longitude');
  const remainder = value % 360;
  if (remainder === 0) return 0;
  if (remainder > 0) return remainder;
  // Adding 360 unnecessarily can round a positive value across a sign cusp.
  // Negative sub-ULP values must remain below the upper, excluded endpoint.
  return Math.min(remainder + 360, 359.99999999999994);
}
export function angularDistance(a,b) { const x = Math.abs(normalize(a) - normalize(b)); return Math.min(x, 360 - x); }
export function signOf(lon) { return SIGNS[Math.floor(normalize(lon) / 30)]; }

export function validateModel(model) {
  plain(model, 'model');
  nonempty(model.engine, 'model.engine'); nonempty(model.engineVersion, 'model.engineVersion');
  plain(model.artifact, 'artifact'); nonempty(model.artifact.scope, 'artifact.scope');
  assert(/^sha256:[0-9a-f]{64}$/.test(model.artifact.digest), 'invalid artifact digest');
  plain(model.conventions, 'conventions');
  for (const key of ['zodiac','origin','frame','corrections','timeScale']) nonempty(model.conventions[key], `conventions.${key}`);
  assert(typeof model.conventions.deltaT === 'string' || (model.conventions.deltaT !== null && typeof model.conventions.deltaT === 'object' && !Array.isArray(model.conventions.deltaT)), 'deltaT convention required');
  canonicalize(model);
  return model;
}
export function validateChartReceipt(receipt) {
  assert(verifySeal(receipt), 'chart receipt integrity failure');
  assert(receipt.schema === 'zodiacs.verify.chart.v1', 'unsupported chart schema');
  nonempty(receipt.subjectId, 'subjectId');
  const c = plain(receipt.context, 'context');
  const ms = instant(c.utc);
  assert(new Date(ms).toISOString() === c.utc, 'receipt utc must be canonical ISO UTC');
  assert(['exact','reference'].includes(c.timeKnowledge), 'invalid timeKnowledge');
  assert((c.latitude === null) === (c.longitude === null), 'coordinates required together');
  if (c.latitude !== null) {
    finite(c.latitude, 'latitude'); finite(c.longitude, 'longitude');
    assert(c.latitude >= -90 && c.latitude <= 90 && c.longitude >= -180 && c.longitude <= 180, 'coordinates out of range');
  }
  nonempty(c.requestedHouseSystem, 'requestedHouseSystem');
  assert(c.effectiveHouseSystem === null || typeof c.effectiveHouseSystem === 'string' && c.effectiveHouseSystem.length > 0, 'invalid effectiveHouseSystem');
  if (c.timeKnowledge === 'reference' || c.latitude === null) assert(c.effectiveHouseSystem === null, 'untimed/unlocated receipt cannot have houses');
  validateModel(receipt.model);
  assert(Array.isArray(receipt.facts) && receipt.facts.length <= 2000, 'facts must be array of at most 2000');
  const ids = new Set(), semanticIds = new Set(), facts = new Map();
  for (const f of receipt.facts) {
    plain(f, 'fact'); nonempty(f.id, 'fact.id'); nonempty(f.entity, 'fact.entity');
    assert(!ids.has(f.id), 'duplicate fact id'); ids.add(f.id);
    const semanticId = canonicalize([f.kind, f.entity]);
    assert(!semanticIds.has(semanticId), 'duplicate fact kind/entity'); semanticIds.add(semanticId);
    assert(f.scope === 'instant', 'unsupported fact scope');
    assert(['longitude','sign','house','aspect'].includes(f.kind), 'unsupported fact kind');
    if (f.kind === 'longitude') { finite(f.value, 'longitude'); assert(f.value >= 0 && f.value < 360 && f.unit === 'deg', 'longitude must be degrees in [0,360)'); }
    if (f.kind === 'sign') assert(SIGNS.includes(f.value), 'invalid sign value');
    if (f.kind === 'house') assert(Number.isInteger(f.value) && f.value >= 1 && f.value <= 12 && c.effectiveHouseSystem !== null, 'invalid house value or missing house context');
    if (f.kind === 'aspect') assert(typeof f.value === 'boolean', 'aspect must be boolean');
    if (c.timeKnowledge === 'reference' || c.latitude === null) assert(!['Ascendant','Midheaven','Descendant','IC'].includes(f.entity) && f.kind !== 'house', 'reference or unlocated chart cannot support angles/houses');
    facts.set(semanticId, f);
  }
  for (const f of receipt.facts.filter(x => x.kind === 'sign')) {
    const lon = facts.get(canonicalize(['longitude', f.entity]));
    if (lon) assert(signOf(lon.value) === f.value, 'sign and longitude inconsistent');
  }
  assert(Array.isArray(receipt.warnings) && receipt.warnings.every(x => typeof x === 'string'), 'warnings must be string array');
  return receipt;
}
export function createChartReceipt(payload) {
  const result = seal(payload);
  return validateChartReceipt(result);
}
