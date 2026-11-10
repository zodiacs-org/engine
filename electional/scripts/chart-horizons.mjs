// Independent ephemeris reducer, never an engine/event library import.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { rows, crossings, verify as verifyBasic, cases as basicCases } from './horizons.mjs';
import { verify as verifyVoid, cases as voidCases } from './void-horizons.mjs';
const casesUrl = new URL('../references/chart-cases.json', import.meta.url);
export const cases = JSON.parse(await readFile(casesUrl, 'utf8'));
const wrap = x => ((x % 360) + 360) % 360;
const branches = [0, 60, 90, 120, 180, 240, 270, 300];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function merge(spans) {
  const answer = [];
  for (const span of [...spans].sort((a, b) => a.startMs - b.startMs)) {
    const last = answer.at(-1);
    if (last && last.endMs >= span.startMs) last.endMs = Math.max(last.endMs, span.endMs);
    else answer.push({ ...span });
  }
  return answer;
}
export function applyingWindows(points, orb, domain) {
  // Independent incoming-side convention for these strictly increasing series.
  for (let i = 1; i < points.length; i++) {
    const delta = wrap(points[i].longitude - points[i - 1].longitude);
    assert(delta > 0 && delta < 180, 'Reference requires strictly direct relative motion.');
  }
  const entryTargets = branches.map(b => wrap(b - orb));
  const transitions = crossings(points, [...branches, ...entryTargets]).sort((a, b) => a.atMs - b.atMs);
  let inside = entryTargets.some((left, i) => wrap(points[0].longitude - left) < orb && points[0].longitude !== branches[i]);
  let cursor = points[0].atMs;
  const spans = [];
  for (const event of transitions) {
    if (inside && event.atMs > cursor) spans.push({ startMs: cursor, endMs: event.atMs });
    inside = entryTargets.includes(event.targetDegrees);
    cursor = event.atMs;
  }
  if (inside) spans.push({ startMs: cursor, endMs: points.at(-1).atMs });
  return spans.map(span => ({ startMs: Math.max(domain.startMs, span.startMs), endMs: Math.min(domain.endMs, span.endMs) }))
    .filter(span => span.startMs < span.endMs);
}
export async function reduce() {
  const basic = await verifyBasic(new URL('../references/horizons.json', import.meta.url)), other = await verifyVoid();
  const moon = rows(basic.responses[0].raw, basicCases.series[0]);
  const perTarget = cases.targets.map(body => {
    const index = voidCases.series.findIndex(s => s.body === body);
    const target = body === 'Sun' ? rows(basic.responses[1].raw, basicCases.series[1])
      : rows(other.responses[index].raw, voidCases.series[index]);
    assert.equal(target.length, moon.length);
    const points = moon.map((point, i) => {
      assert.equal(point.atMs, target[i].atMs);
      return { atMs: point.atMs, longitude: wrap(point.longitude - target[i].longitude) };
    });
    return { body, windows: applyingWindows(points, cases.maxOrbDegrees, cases.range) };
  });
  const all = perTarget[0].windows.flatMap(a => perTarget[1].windows.map(b => ({
    startMs: Math.max(a.startMs, b.startMs), endMs: Math.min(a.endMs, b.endMs) })).filter(s => s.startMs < s.endMs));
  return { source: cases.source, clock: cases.clock, frame: cases.frame,
    inputs: Object.fromEntries(await Promise.all(['references/horizons.json', 'references/void-horizons.json', 'references/chart-cases.json']
      .map(async path => [path, hash(await readFile(new URL(`../${path}`, import.meta.url)))]))),
    perTarget, any: merge(perTarget.flatMap(t => t.windows)), all: merge(all) };
}
export async function verify(file = new URL('../references/chart-horizons.json', import.meta.url)) {
  const value = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(value, await reduce());
  return value;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--reduce') {
    const text = JSON.stringify(await reduce(), null, 2) + '\n';
    assert(Buffer.byteLength(text) < 2000000);
    await writeFile(new URL('../generated/chart-horizons.json', import.meta.url), text);
    console.log('Wrote independent applying-window reductions to generated/chart-horizons.json.');
  } else if (process.argv[2] === '--verify') {
    await verify(); console.log('Independent applying references, raw hashes and reductions verified.');
  } else throw new Error('Use --reduce or --verify.');
}
