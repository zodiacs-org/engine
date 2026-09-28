#!/usr/bin/env node
/*
 * What did the clock say? Reads a local date and time at a place from the
 * atlas and prints the UTC instant(s), the offset, the rule and its
 * uncertainty as JSON.
 *
 *   node atlas/tools/resolve.mjs --place fr-brest --local 1885-06-01T12:00:00
 *   node atlas/tools/resolve.mjs --jurisdiction fr-general --longitude -1.55 --local 1885-06-01T12:00
 *   node atlas/tools/resolve.mjs --place fr-paris --local 1905-06-01T12:00 --clock railway
 *   node atlas/tools/resolve.mjs --place us-new-york --utc 1883-11-18T17:00:00Z
 *
 * --local accepts YYYY-MM-DDTHH:MM or YYYY-MM-DDTHH:MM:SS. Exit status 0
 * for "ok", 2 for "ambiguous" or "nonexistent" (the answer is still
 * printed), 3 for "out-of-coverage", 1 for errors.
 */
import { buildTimeline, formatUtc, formatWall, loadAtlas, placeFor, resolve, wallAt } from './lib.mjs';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const atlas = loadAtlas();
  const clock = argument('clock') ?? 'civil';
  let spec = argument('place');
  if (!spec) {
    const jurisdiction = argument('jurisdiction');
    const longitude = Number(argument('longitude'));
    if (!jurisdiction || !Number.isFinite(longitude)) throw new Error('give --place, or --jurisdiction with --longitude');
    spec = { jurisdiction, longitude };
  }
  const utc = argument('utc');
  if (utc) {
    const place = placeFor(atlas, spec);
    const timeline = buildTimeline(atlas, place, clock);
    const instant = Date.parse(utc);
    if (!Number.isFinite(instant)) throw new Error(`not a UTC instant: ${utc}`);
    const found = timeline && wallAt(timeline, instant);
    const result = found
      ? {
          status: 'ok',
          utc: formatUtc(instant),
          local: formatWall(found.wallMs),
          rule: found.segment.rule.id,
          uncertainty: found.segment.rule.uncertainty,
        }
      : { status: 'out-of-coverage', utc: formatUtc(instant) };
    console.log(JSON.stringify(result, null, 2));
    process.exit(found ? 0 : 3);
  }
  let local = argument('local');
  if (!local) throw new Error('give --local YYYY-MM-DDTHH:MM[:SS] or --utc');
  if (/T\d{2}:\d{2}$/.test(local)) local += ':00';
  const result = resolve(atlas, spec, local, clock);
  for (const instant of result.instants) delete instant.utcMs;
  console.log(JSON.stringify(result, null, 2));
  process.exit({ ok: 0, ambiguous: 2, nonexistent: 2, 'out-of-coverage': 3 }[result.status] ?? 1);
}

try {
  main();
} catch (error) {
  console.error(`resolve: ${error.message}`);
  process.exit(1);
}
