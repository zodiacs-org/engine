// Independent reference-only reduction. No engine or events import.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { rows, crossings, shortArc, verify as verifyBasic, cases as basicCases } from './horizons.mjs';
import { verify as verifyVoid, cases as voidCases } from './void-horizons.mjs';
export const cases = JSON.parse(await readFile(new URL('../references/synastry-cases.json', import.meta.url), 'utf8'));
const wrap = x => ((x % 360) + 360) % 360;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function merge(spans) {
  const out = [];
  for (const span of [...spans].sort((a, b) => a.startMs - b.startMs)) {
    const last = out.at(-1);
    if (last && span.startMs <= last.endMs) last.endMs = Math.max(last.endMs, span.endMs);
    else out.push({ ...span });
  }
  return out;
}
/** Piecewise-linear reference only; it has no sky calculation. */
export function fixedWindows(points, fixed, aspects, cap, domain) {
  assert(points.length > 1 && domain.startMs >= points[0].atMs && domain.endMs <= points.at(-1).atMs);
  const relative = points.map(p => ({ atMs: p.atMs, longitude: wrap(p.longitude - fixed) }));
  for (let i = 1; i < relative.length; i++) {
    assert(relative[i].atMs > relative[i - 1].atMs);
    assert(Math.abs(shortArc(relative[i].longitude - relative[i - 1].longitude)) < 180);
  }
  const branches = aspects.flatMap(a => [a.angle, wrap(-a.angle)].map(angle => ({ angle, orb: Math.min(cap, a.nativeLuminaryOrb) })));
  const targets = [...new Set(branches.flatMap(a => [wrap(a.angle - a.orb), wrap(a.angle + a.orb)]))];
  const edges = crossings(relative, targets).map(e => e.atMs).filter(t => t > domain.startMs && t < domain.endMs);
  const cuts = [...new Set([domain.startMs, ...edges, domain.endMs])].sort((a, b) => a - b);
  const answer = [];
  for (let i = 1; i < cuts.length; i++) {
    const startMs = cuts[i - 1], endMs = cuts[i], t = (startMs + endMs) / 2;
    const right = relative.findIndex(p => p.atMs >= t), left = relative[right - 1], next = relative[right];
    const lon = wrap(left.longitude + shortArc(next.longitude - left.longitude) * ((t - left.atMs) / (next.atMs - left.atMs)));
    if (branches.some(a => Math.abs(shortArc(lon - a.angle)) <= a.orb)) answer.push({ startMs, endMs });
  }
  return merge(answer);
}
export async function reduce() {
  const basic = await verifyBasic(new URL('../references/horizons.json', import.meta.url)), other = await verifyVoid();
  const leap = await readFile(new URL('../../scripts/time-scale-sources/leap-seconds.list', import.meta.url), 'utf8');
  const applicable = leap.split('\n').filter(s => /^\d+\s+\d+\s+#/u.test(s)).map(s => {
    const [epoch, offset] = s.trim().split(/\s+/u).map(Number);
    return { atMs: (epoch - 2208988800) * 1000, offset };
  }).filter(row => row.atMs <= Date.parse(cases.natal.instant)).at(-1);
  assert.equal(applicable.offset * 1000 + 32184, cases.natalTtMinusUtcMs);
  assert.equal(Date.parse(cases.natal.instant) + cases.natalTtMinusUtcMs, cases.natalTtMs);
  const moon = rows(basic.responses[0].raw, basicCases.series[0]);
  const perTarget = cases.targets.map(body => {
    const index = voidCases.series.findIndex(s => s.body === body);
    const points = body === 'Sun' ? rows(basic.responses[1].raw, basicCases.series[1]) : rows(other.responses[index].raw, voidCases.series[index]);
    assert.equal(points[0].atMs, cases.natalTtMs);
    return { body, natalLongitude: points[0].longitude,
      windows: fixedWindows(moon, points[0].longitude, cases.aspects, cases.maxOrbDegrees, cases.range) };
  });
  let all = perTarget[0].windows;
  for (const pair of perTarget.slice(1)) all = all.flatMap(a => pair.windows.map(b => ({ startMs: Math.max(a.startMs, b.startMs),
    endMs: Math.min(a.endMs, b.endMs) })).filter(s => s.startMs < s.endMs));
  return { source: cases.source, clock: cases.clock, frame: cases.frame,
    inputs: Object.fromEntries(await Promise.all(['references/horizons.json', 'references/void-horizons.json', 'references/synastry-cases.json',
      '../scripts/time-scale-sources/leap-seconds.list'].map(async path => [path, hash(await readFile(new URL(`../${path}`, import.meta.url)))]))),
    natalTtMs: cases.natalTtMs, perTarget, any: merge(perTarget.flatMap(p => p.windows)), all: merge(all) };
}
export async function verify(file = new URL('../references/synastry-horizons.json', import.meta.url)) {
  const value = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(value, await reduce()); return value;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--reduce') {
    const value = JSON.stringify(await reduce(), null, 2) + '\n';
    assert(Buffer.byteLength(value) < 2000000);
    await writeFile(new URL('../generated/synastry-horizons.json', import.meta.url), value);
    console.log('Wrote independent fixed-natal windows to generated/synastry-horizons.json for review.');
  } else if (process.argv[2] === '--verify') {
    await verify(); console.log('Independent fixed-natal reference clocks, raw hashes and windows verified.');
  } else throw new Error('Use --reduce or --verify.');
}
