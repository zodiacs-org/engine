// Reference acquisition/reduction only. Never imported by the search library.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const cases = JSON.parse(await readFile(new URL('../references/cases.json', import.meta.url), 'utf8'));
const digest = raw => createHash('sha256').update(raw, 'utf8').digest('hex');
export const shortArc = value => ((value + 540) % 360) - 180;
const wrap = value => ((value % 360) + 360) % 360;

export function parameters(series) {
  return { format: 'json', COMMAND: `'${series.command}'`, CENTER: "'500@399'", EPHEM_TYPE: "'OBSERVER'",
    START_TIME: `'${series.start}'`, STOP_TIME: `'${series.end}'`, STEP_SIZE: "'1 h'",
    QUANTITIES: "'31'", TIME_TYPE: "'TT'", CSV_FORMAT: "'YES'", CAL_FORMAT: "'JD'",
    CAL_TYPE: "'GREGORIAN'", EXTRA_PREC: "'YES'", OBJ_DATA: "'NO'" };
}
export function rows(raw, series) {
  const response = JSON.parse(raw);
  assert(!response.error && typeof response.result === 'string');
  const text = response.result;
  assert(text.includes('DE441') && text.includes('GEOCENTRIC') && text.includes('JDTT'));
  assert(new RegExp(`Target body name: ${series.body} \\(${series.command}\\)`).test(text));
  assert(text.includes('ObsEcLon') && text.includes('IAU76/80') && text.includes('light-time'));
  const parts = text.split('$$SOE');
  assert.equal(parts.length, 2);
  const table = parts[1].split('$$EOE');
  assert.equal(table.length, 2);
  const points = table[0].trim().split('\n').map(line => {
    const fields = line.split(',');
    assert.equal(fields.length, 6);
    const jd = Number(fields[0]), lon = Number(fields[3]), lat = Number(fields[4]);
    assert(Number.isFinite(jd) && Number.isFinite(lon) && lon >= 0 && lon < 360 && Number.isFinite(lat));
    return { atMs: Math.round((jd - 2440587.5) * 86400000), longitude: lon };
  });
  assert.equal(points[0].atMs, Date.parse(`${series.start}T00:00:00Z`));
  assert.equal(points.at(-1).atMs, Date.parse(`${series.end}T00:00:00Z`));
  for (let i = 1; i < points.length; i++) assert.equal(points[i].atMs - points[i - 1].atMs, 3600000);
  return points;
}
function interpolate(left, right, a, b) {
  assert(a !== b);
  return Math.round(left + (right - left) * (-a / (b - a)));
}
export function crossings(points, targets) {
  const result = [];
  for (let i = 1; i < points.length; i++) {
    const left = points[i - 1], right = points[i];
    for (const targetDegrees of targets) {
      const a = shortArc(left.longitude - targetDegrees), b = shortArc(right.longitude - targetDegrees);
      if (Math.abs(b - a) >= 180 || !((a < 0 && b >= 0) || (a > 0 && b <= 0))) continue;
      result.push({ atMs: interpolate(left.atMs, right.atMs, a, b), targetDegrees,
        direction: b > a ? 'direct' : 'retrograde', referenceBracket: [left.atMs, right.atMs] });
    }
  }
  return result.sort((a, b) => a.atMs - b.atMs);
}
export function stations(points) {
  const speeds = points.slice(1).map((right, i) => ({ atMs: (right.atMs + points[i].atMs) / 2,
    value: shortArc(right.longitude - points[i].longitude) / ((right.atMs - points[i].atMs) / 86400000) }));
  const result = [];
  for (let i = 1; i < speeds.length; i++) {
    const left = speeds[i - 1], right = speeds[i];
    if (!((left.value < 0 && right.value >= 0) || (left.value > 0 && right.value <= 0))) continue;
    result.push({ atMs: interpolate(left.atMs, right.atMs, left.value, right.value),
      direction: right.value > left.value ? 'direct' : 'retrograde', referenceBracket: [left.atMs, right.atMs] });
  }
  return result;
}
export function reduce(responses) {
  assert.equal(responses.length, cases.series.length);
  const series = responses.map((response, i) => {
    assert.deepEqual(response.parameters, parameters(cases.series[i]));
    assert.equal(response.url, `https://ssd.jpl.nasa.gov/api/horizons.api?${new URLSearchParams(response.parameters)}`);
    assert.equal(digest(response.raw), response.sha256);
    return rows(response.raw, cases.series[i]);
  });
  const moon = series[0], sun = series[1];
  assert.equal(moon.length, sun.length);
  const relative = moon.map((point, i) => {
    assert.equal(point.atMs, sun[i].atMs);
    return { atMs: point.atMs, longitude: wrap(point.longitude - sun[i].longitude) };
  });
  const stationReferences = series.slice(2).map((points, i) => {
    const found = stations(points);
    assert.equal(found.length, 1);
    assert.equal(found[0].direction, cases.series[i + 2].stationDirection);
    return { id: cases.series[i + 2].id, body: cases.series[i + 2].body, ...found[0] };
  });
  const ingress = crossings(moon, Array.from({ length: 12 }, (_, i) => i * 30));
  const phase = crossings(relative, Array.from({ length: 8 }, (_, i) => 22.5 + i * 45));
  assert(ingress.length >= 12 && phase.length >= 8);
  return { ingress, phase, stations: stationReferences };
}
export async function verify(file) {
  const reference = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(reference.source, cases.source);
  assert.equal(reference.clock, cases.clock);
  assert.equal(reference.frame, cases.frame);
  assert(Number.isFinite(Date.parse(reference.retrievedAt)));
  assert.deepEqual(reference.events, reduce(reference.responses));
  return reference;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--verify') {
    await verify(process.argv[3] ?? fileURLToPath(new URL('../references/horizons.json', import.meta.url)));
    console.log('Independent Horizons requests, raw digests and reductions verified.');
  } else if (process.argv[2] === '--acquire' && process.argv.length === 3) {
    const responses = [];
    for (const series of cases.series) {
      const params = parameters(series);
      const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${new URLSearchParams(params)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      assert(response.ok, `Horizons HTTP ${response.status}`);
      // Bound the stream before assembling a response or writing generated data.
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        assert(size <= 1000000, 'Horizons response exceeded acquisition cap.');
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      rows(raw, series);
      responses.push({ parameters: params, url, raw, sha256: digest(raw) });
      console.log(`Read ${series.id} from JPL Horizons.`);
    }
    const reference = { source: cases.source, clock: cases.clock, frame: cases.frame,
      retrievedAt: new Date().toISOString(), responses, events: reduce(responses) };
    const output = new URL('../generated/horizons.json', import.meta.url);
    await mkdir(new URL('../generated/', import.meta.url), { recursive: true });
    const text = JSON.stringify(reference, null, 2) + '\n';
    assert(Buffer.byteLength(text) < 2000000, 'Reference exceeds repository file cap.');
    await writeFile(output, text);
    console.log('Wrote electional/generated/horizons.json for review.');
  } else throw new Error('Use --verify [file] or --acquire.');
}
