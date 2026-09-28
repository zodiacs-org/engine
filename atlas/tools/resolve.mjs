#!/usr/bin/env node
/*
 * What did the clock say? Reads a local date and time at a place from the
 * atlas and prints the UTC instant(s), the offset, the rule and its
 * uncertainty as JSON; or, with --utc, what the place's clock read at a UTC
 * instant.
 *
 *   node atlas/tools/resolve.mjs --place fr-brest --local 1885-06-01T12:00:00
 *   node atlas/tools/resolve.mjs --jurisdiction fr-general --department 44 --longitude -1.55 --local 1885-06-01T12:00
 *   node atlas/tools/resolve.mjs --place fr-paris --local 1905-06-01T12:00 --clock railway
 *   node atlas/tools/resolve.mjs --place us-new-york --utc 1883-11-18T17:00:00Z
 *
 * --local accepts YYYY-MM-DDTHH:MM or YYYY-MM-DDTHH:MM:SS. --utc accepts the
 * same, with or without a trailing Z, and is always read as UTC. A place not
 * listed in the atlas can be read by longitude only in a jurisdiction that
 * allows it (fr-general), with its département, which is checked.
 * --data DIR reads another data directory (the tools' self-test uses it).
 *
 * Exit status 0 for "ok", 2 for "ambiguous" or "nonexistent" (the answer is
 * still printed), 3 for "out-of-coverage", 4 for "no-such-clock", 1 for
 * errors (including a place or longitude the atlas does not cover).
 */
import { DATA_DIR, loadAtlas, resolve, resolveUtc } from './lib.mjs';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const EXIT = { ok: 0, ambiguous: 2, nonexistent: 2, 'out-of-coverage': 3, 'no-such-clock': 4 };

function main() {
  const atlas = loadAtlas(argument('data') ?? DATA_DIR);
  const clock = argument('clock') ?? 'civil';
  let spec = argument('place');
  if (!spec) {
    const jurisdiction = argument('jurisdiction');
    const longitudeText = argument('longitude');
    if (!jurisdiction || longitudeText === undefined) throw new Error('give --place, or --jurisdiction with --department and --longitude');
    spec = { jurisdiction, longitude: Number(longitudeText), department: argument('department') };
  }
  const utc = argument('utc');
  let local = argument('local');
  if (utc !== undefined && local !== undefined) throw new Error('give --local or --utc, not both');
  let result;
  if (utc !== undefined) {
    result = resolveUtc(atlas, spec, utc, clock);
  } else {
    if (!local) throw new Error('give --local YYYY-MM-DDTHH:MM[:SS] or --utc YYYY-MM-DDTHH:MM[:SS][Z]');
    if (/T\d{2}:\d{2}$/.test(local)) local += ':00';
    result = resolve(atlas, spec, local, clock);
  }
  for (const instant of result.instants) delete instant.utcMs;
  console.log(JSON.stringify(result, null, 2));
  process.exit(EXIT[result.status] ?? 1);
}

try {
  main();
} catch (error) {
  console.error(`resolve: ${error.message}`);
  process.exit(1);
}
