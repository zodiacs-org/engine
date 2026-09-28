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
 * same, with or without a trailing Z, and is always read as UTC. Fields out of
 * range (a minute of 75) are refused. --clock is civil or railway. A place
 * not listed in the atlas can be read by longitude only in a jurisdiction
 * that allows it (fr-general), with its département, which is checked; the
 * longitude must be plain decimal degrees east.
 * --data DIR reads another data directory (the tools' self-test uses it).
 *
 * Each option takes one value and is given once. An unknown option, an
 * option without its value, an option given twice, a word that is not an
 * option, and --place together with --jurisdiction, --department or
 * --longitude are refused, so that the answer printed is always to the
 * question asked.
 *
 * Exit status 0 for "ok", 2 for "ambiguous" or "nonexistent" (the answer is
 * still printed), 3 for "out-of-coverage", 4 for "no-such-clock", 1 for
 * errors (including malformed input and a place or longitude the atlas does
 * not cover).
 */
import { DATA_DIR, loadAtlas, resolve, resolveUtc } from './lib.mjs';

/** The options; each takes one value. */
const OPTIONS = ['place', 'jurisdiction', 'department', 'longitude', 'local', 'utc', 'clock', 'data'];
/** The options that name a place by longitude, in place of --place. */
const BY_LONGITUDE = ['jurisdiction', 'department', 'longitude'];

/** Reads "--name value" pairs, refusing anything else rather than ignoring it. */
function readOptions(words) {
  const options = {};
  for (let index = 0; index < words.length; index += 2) {
    const word = words[index];
    if (!word.startsWith('--')) throw new Error(`unexpected "${word}": each value follows its option, as in --local 1885-06-01T12:00`);
    const name = word.slice(2);
    if (!OPTIONS.includes(name)) throw new Error(`unknown option ${word}; the options are ${OPTIONS.map((option) => `--${option}`).join(', ')}`);
    if (Object.hasOwn(options, name)) throw new Error(`${word} is given more than once`);
    const value = words[index + 1];
    if (value === undefined || value === '' || value.startsWith('--')) throw new Error(`${word} needs a value`);
    options[name] = value;
  }
  return options;
}

const EXIT = { ok: 0, ambiguous: 2, nonexistent: 2, 'out-of-coverage': 3, 'no-such-clock': 4 };

function main() {
  const options = readOptions(process.argv.slice(2));
  let spec;
  if (options.place !== undefined) {
    const alsoGiven = BY_LONGITUDE.filter((name) => options[name] !== undefined).map((name) => `--${name}`);
    if (alsoGiven.length) throw new Error(`give --place, or --jurisdiction with --department and --longitude, not both (--place was given with ${alsoGiven.join(', ')})`);
    spec = options.place;
  } else {
    const { jurisdiction, department, longitude: longitudeText } = options;
    if (jurisdiction === undefined || longitudeText === undefined) throw new Error('give --place, or --jurisdiction with --department and --longitude');
    // Number() would read "0x5" as 5 and "1e1" as 10; only a plain decimal is a longitude.
    if (!/^[+-]?\d+(\.\d+)?$/.test(longitudeText)) throw new Error(`--longitude must be decimal degrees east, such as -1.55, not "${longitudeText}"`);
    spec = { jurisdiction, longitude: Number(longitudeText), department };
  }
  const { utc } = options;
  let { local } = options;
  if (utc !== undefined && local !== undefined) throw new Error('give --local or --utc, not both');
  if (utc === undefined && local === undefined) throw new Error('give --local YYYY-MM-DDTHH:MM[:SS] or --utc YYYY-MM-DDTHH:MM[:SS][Z]');
  const atlas = loadAtlas(options.data ?? DATA_DIR);
  const clock = options.clock ?? 'civil';
  let result;
  if (utc !== undefined) {
    result = resolveUtc(atlas, spec, utc, clock);
  } else {
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
