// Independent reference reduction only. This script never imports the engine or events.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cases as basicCases, parameters, rows, crossings, verify as verifyBasic } from './horizons.mjs';

export const cases = JSON.parse(await readFile(new URL('../references/void-cases.json', import.meta.url), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const baseUrl = new URL('../references/horizons.json', import.meta.url);
const base = await verifyBasic(baseUrl);
const baseSha256 = digest(await readFile(baseUrl));
const wrap = angle => ((angle % 360) + 360) % 360;
const named = [[0, 'conjunction'], [60, 'sextile'], [90, 'square'], [120, 'trine'],
  [180, 'opposition'], [240, 'trine'], [270, 'square'], [300, 'sextile']];

export function contacts(moon, other, body) {
  assert.equal(moon.length, other.length);
  const points = moon.map((point, i) => {
    assert.equal(point.atMs, other[i].atMs);
    return { atMs: point.atMs, longitude: wrap(point.longitude - other[i].longitude) };
  });
  return crossings(points, named.map(([angle]) => angle)).map(event => ({ ...event, body,
    aspect: named.find(([angle]) => angle === event.targetDegrees)[1] }));
}
/** Independently group already reduced reference dates by sign residence. */
export function residences(ingresses, contacts) {
  const sorted = [...contacts].sort((a, b) => a.atMs - b.atMs || a.body.localeCompare(b.body)
    || a.aspect.localeCompare(b.aspect) || a.targetDegrees - b.targetDegrees);
  return ingresses.slice(1).map((exit, i) => {
    const entry = ingresses[i];
    const last = sorted.filter(contact => contact.atMs > entry.atMs && contact.atMs < exit.atMs).at(-1) ?? null;
    return { startMs: last?.atMs ?? entry.atMs, endMs: exit.atMs,
      signIndex: entry.targetDegrees / 30, lastContact: last };
  });
}
export function reduce(responses) {
  assert.equal(responses.length, cases.series.length);
  const moon = rows(base.responses[0].raw, basicCases.series[0]);
  const series = [rows(base.responses[1].raw, basicCases.series[1]), ...responses.map((response, i) => {
    const p = parameters(cases.series[i]);
    assert.deepEqual(response.parameters, p);
    assert.equal(response.url, `https://ssd.jpl.nasa.gov/api/horizons.api?${new URLSearchParams(p)}`);
    assert.equal(digest(response.raw), response.sha256);
    return rows(response.raw, cases.series[i]);
  })];
  const bodies = ['Sun', ...cases.series.map(item => item.body)];
  const found = bodies.flatMap((body, i) => contacts(moon, series[i], body));
  const ingress = crossings(moon, Array.from({ length: 12 }, (_, i) => i * 30));
  return { traditional: residences(ingress, found.filter(contact => bodies.indexOf(contact.body) < 6)),
    modern: residences(ingress, found) };
}
export async function verify(file = new URL('../references/void-horizons.json', import.meta.url)) {
  const reference = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(reference.source, cases.source);
  assert.equal(reference.clock, cases.clock);
  assert.equal(reference.frame, cases.frame);
  assert.equal(reference.baseSha256, baseSha256);
  assert(Number.isFinite(Date.parse(reference.retrievedAt)));
  assert.deepEqual(reference.windows, reduce(reference.responses));
  return reference;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--verify') {
    await verify(process.argv[3]);
    console.log('Independent void-reference requests, source digests and reductions verified.');
  } else if (process.argv[2] === '--acquire' && process.argv.length === 3) {
    const responses = [];
    const curl = promisify(execFile);
    for (const series of cases.series) {
      const p = parameters(series);
      const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${new URLSearchParams(p)}`;
      // curl preserves the inherited proxy and CA settings. No shell interpolation.
      const { stdout: raw } = await curl('curl', ['--fail', '--silent', '--show-error', '--max-time', '45',
        '--max-filesize', '1000000', url], { maxBuffer: 1000000 });
      rows(raw, series);
      responses.push({ parameters: p, url, raw, sha256: digest(raw) });
      console.log(`Read independent October ${series.body} longitudes from JPL Horizons.`);
    }
    const reference = { source: cases.source, clock: cases.clock, frame: cases.frame,
      retrievedAt: new Date().toISOString(), baseSha256, responses, windows: reduce(responses) };
    const text = JSON.stringify(reference, null, 2) + '\n';
    assert(Buffer.byteLength(text) < 2000000, 'Reference exceeds repository file cap.');
    await mkdir(new URL('../generated/', import.meta.url), { recursive: true });
    await writeFile(new URL('../generated/void-horizons.json', import.meta.url), text);
    console.log('Wrote electional/generated/void-horizons.json for review.');
  } else throw new Error('Use --verify [file] or --acquire.');
}
