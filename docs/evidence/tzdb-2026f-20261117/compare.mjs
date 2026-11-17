/*
 * The built engine against the outside oracle, tzdata 2026f compiled by zic.
 * The only expectations are zdump's text and a second, independent TZif
 * reader (Python's zoneinfo on the same compiled tree); nothing is taken from
 * the engine, its shards or the generator.
 *
 * 1. Every transition before 1970 of every name: zoneOffsetAt(name, t - 1 s)
 *    and zoneOffsetAt(name, t + 1 s) against zdump's offsets on either side,
 *    from the pinned build's dump, or the default build's for the names
 *    host-legal by the dumps (their pinned and default builds differ from
 *    1970 on). Spans zdump marks "-00" are read from the host by design and
 *    are counted, not compared.
 * 2. The host-legal marking: the names the engine labels dataForm "main"
 *    against the names the dumps make host-legal.
 * 3. 5,000 (name, instant before 1970) pairs from a fixed seed against
 *    Python's zoneinfo reading the compiled TZif files.
 *
 *   node docs/evidence/tzdb-2026f-20261117/compare.mjs --dumps DIR --zic ZIC \
 *     --tzdata tzdata2026f.tar.gz --geo dist/geo.js [--mutate ZONE]
 *
 * --mutate copies the geo entry's directory, moves ZONE's first transition
 * in its shard by 3600 s, and runs the comparison on the copy: it must fail.
 * Exit 1 on any mismatch.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { compileForm, extract } from "./oracle.mjs";
import { readZdump, shipped, stateAt } from "./zdump-read.mjs";

const options = {};
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 2) options[argv[index].replace(/^--/, "")] = argv[index + 1];
for (const key of ["dumps", "zic", "tzdata", "geo"]) if (!options[key]) throw new Error(`compare: --${key} is required`);

const read = (form) =>
  readZdump(
    readFileSync(join(options.dumps, `2026f-${form}-1800-1970.zdump`), "utf8") +
      readFileSync(join(options.dumps, `2026f-${form}-1970-2038.zdump`), "utf8")
  );
const pinned = read("pinned");
const host = read("default");

let geoPath = resolve(options.geo);
let mutated = null;
if (options.mutate) {
  const copy = mkdtempSync(join(tmpdir(), "tzdb-compare-mutant-"));
  cpSync(dirname(geoPath), copy, { recursive: true });
  const key = options.mutate.toLowerCase();
  const file = readdirSync(copy).find((name) => /^tzdb-\d{4}[a-z]-\d{2}-/.test(name) && readFileSync(join(copy, name), "utf8").includes(`"${key}":{`));
  if (!file) throw new Error(`compare: no shard holds ${options.mutate}`);
  const text = readFileSync(join(copy, file), "utf8");
  const next = text.replace(new RegExp(`("${key.replace(/[/+]/g, "\\$&")}":\\{[^}]*?"t":")(-?[0-9a-z]+)`), (_, head, first) => {
    mutated = `${options.mutate}: first transition ${parseInt(first, 36)} -> ${parseInt(first, 36) + 3600}`;
    return head + (parseInt(first, 36) + 3600).toString(36);
  });
  if (!mutated) throw new Error(`compare: could not move ${options.mutate}'s first transition`);
  writeFileSync(join(copy, file), next);
  geoPath = join(copy, basename(geoPath));
  console.log(`compare: mutant ${mutated} in ${file}`);
}
const geo = await import(pathToFileURL(geoPath).href);

const names = [...host.keys()].sort();
const marks = new Map(names.map((name) => [name, shipped(pinned, host, name)]));
const mismatches = [];
let compared = 0;
let fromHost = 0;
const engineMain = [];
for (const name of names) {
  await geo.prepareLocalTime("1850-01-01", name);
  const { form } = marks.get(name);
  const clock = form === "main" ? host.get(name) : pinned.get(name);
  const probe = geo.resolveLocalToUtc("1969-06-01", "12:00", name);
  if (probe.zone.source === "tzdb" && probe.zone.dataForm === "main") engineMain.push(name);
  for (const change of clock.changes) {
    if (change.t >= 0) break;
    for (const t of [change.t - 1, change.t + 1]) {
      const expected = stateAt(clock, t);
      if (expected.abbr === "-00") {
        fromHost += 1;
        continue;
      }
      compared += 1;
      const got = Math.round(geo.zoneOffsetAt(name, t * 1000) * 60);
      if (got !== expected.offset) mismatches.push(`${name} ${new Date(t * 1000).toISOString()}: zdump ${expected.offset} s, engine ${got} s`);
    }
  }
}
console.log(`compare: ${names.length} names, ${compared} instants at transitions before 1970 compared, ${fromHost} in "-00" spans read from the host, ${mismatches.length} mismatches`);

const oracleMain = names.filter((name) => marks.get(name).form === "main");
// A host-legal name the probe in 1969 found answered by the host ("-00" there) is listed by the dumps only.
const markingDiffers = oracleMain.filter((name) => !engineMain.includes(name)).concat(engineMain.filter((name) => !oracleMain.includes(name)));
console.log(`compare: host-legal by the dumps ${oracleMain.length}, labelled "main" by the engine ${engineMain.length}, differing ${markingDiffers.length}${markingDiffers.length ? ": " + markingDiffers.join(", ") : ""}`);
console.log(`compare: host-legal names: ${oracleMain.join(", ")}`);

// 3. The property check against Python's zoneinfo, a second TZif reader.
let seed = 0x282;
const random = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let x = seed;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
const LOW = Date.UTC(1800, 0, 1) / 1000;
const pairs = Array.from({ length: 5000 }, () => [names[Math.floor(random() * names.length)], LOW + Math.floor(random() * -LOW)]);
const work = mkdtempSync(join(tmpdir(), "tzdb-compare-"));
let propertyMismatches = 0;
let propertySkipped = 0;
try {
  const { data, version } = extract(resolve(options.tzdata), work);
  if (version !== "2026f") throw new Error(`compare: --tzdata is ${version}`);
  const trees = { pinned: compileForm(data, "pinned", work, resolve(options.zic)), main: compileForm(data, "default", work, resolve(options.zic)) };
  const request = pairs.map(([name, s]) => [marks.get(name).form === "main" ? trees.main.dir : trees.pinned.dir, name, s]);
  writeFileSync(join(work, "pairs.json"), JSON.stringify(request));
  const script = [
    "import json, sys, zoneinfo, datetime",
    "out = []",
    "for root, name, s in json.load(open(sys.argv[1])):",
    "    zoneinfo.reset_tzpath([root])",
    "    zone = zoneinfo.ZoneInfo.no_cache(name)",
    "    moment = datetime.datetime.fromtimestamp(s, tz=datetime.timezone.utc).astimezone(zone)",
    "    out.append([moment.utcoffset().total_seconds(), moment.tzname()])",
    "json.dump(out, sys.stdout)"
  ].join("\n");
  writeFileSync(join(work, "read.py"), script);
  const answers = JSON.parse(execFileSync("python3", ["-I", join(work, "read.py"), join(work, "pairs.json")], { encoding: "utf8", maxBuffer: 1 << 26 }));
  pairs.forEach(([name, s], index) => {
    const [offset, abbreviation] = answers[index];
    if (abbreviation === "-00") {
      propertySkipped += 1;
      return;
    }
    const got = Math.round(geo.zoneOffsetAt(name, s * 1000) * 60);
    if (got !== offset) {
      propertyMismatches += 1;
      mismatches.push(`property ${name} ${new Date(s * 1000).toISOString()}: zoneinfo ${offset} s, engine ${got} s`);
    }
  });
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(`compare: property, 5000 pairs (seed 0x282): ${5000 - propertySkipped} compared with Python zoneinfo, ${propertySkipped} in "-00" spans, ${propertyMismatches} mismatches`);
for (const line of mismatches.slice(0, 20)) console.log(`  ${line}`);
if (mutated) rmSync(dirname(geoPath), { recursive: true, force: true });
process.exit(mismatches.length || markingDiffers.length ? 1 : 0);
