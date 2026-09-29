/*
 * The causes that scripts/build-tz-shards.mjs gives each transition, before
 * and after the line-end fix of rc15-fix-time (review finding: 30 changes of
 * standard offset labelled "dst").
 *
 * A zone line whose UNTIL is on the wall clock ends at the first instant s
 * with s = UNTIL - (offset in force just before s). rc.15's first cut started
 * a fixed-point search at UNTIL - STDOFF, which for a line that ends during
 * daylight saving while the clock goes back lies past the change, and there
 * the search stops on the next line's clock, an hour late. The transition at
 * the true end then fell inside the old line and was labelled "dst".
 *
 * For every zone of tzdata 2025c's two compilations the generator makes (main
 * + backzone, and the default build, main + backward), compiled by zic, this
 * script
 * - lists every transition whose cause differs between the two rules;
 * - for every wall-clock line end where the standard offset changes and zic
 *   wrote a transition within two days, checks that the end falls on one of
 *   those transitions, under each rule (zic's own output as the reference).
 *
 *   TZDATA_TARBALL=<tzdata2025c.tar.gz> [ZIC=<zic>] node docs/evidence/rc15-20260929/tz-line-ends.mjs [out.json]
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const generator = await import(new URL("../../../scripts/build-tz-shards.mjs", import.meta.url).href);
const { MAIN_FILES, BACKZONE, loadRelease, readTzif, parseClock, untilParts, lineEnds, causes, DATE_LINE_SECONDS } = generator;
const zic = process.env.ZIC ?? "zic";
const root = new URL("../../../", import.meta.url).pathname;
const { files, main, backzone } = await loadRelease(root);

function compile(sources) {
  const work = mkdtempSync(join(tmpdir(), "tz-line-ends-"));
  try {
    for (const file of sources) writeFileSync(join(work, file), files.get(file));
    execFileSync(zic, ["-d", join(work, "out"), ...sources.map((file) => join(work, file))], { stdio: ["ignore", "ignore", "pipe"] });
    const out = new Map();
    const walk = (directory, prefix) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(join(directory, entry.name), name);
        else out.set(name, readTzif(readFileSync(join(directory, entry.name))));
      }
    };
    walk(join(work, "out"), "");
    return out;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const typeAt = (tzif, s) => {
  let lo = 0;
  let hi = tzif.t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tzif.t[mid] <= s) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? 0 : tzif.typeOf[lo - 1];
};

/** rc.15's first cut: a fixed-point search from the standard reading. */
function lineEndsBefore(lines, tzif) {
  return lines.map((line) => {
    if (line.length < 4) return Infinity;
    const stdoff = parseClock(line[0]);
    const { local, kind } = untilParts(line.slice(3));
    if (kind === "u") return local;
    if (kind === "s") return local - stdoff;
    let guess = local - stdoff;
    for (let round = 0; round < 4; round += 1) {
      const next = local - tzif.offsets[typeAt(tzif, guess - 1)];
      if (next === guess) break;
      guess = next;
    }
    return guess;
  });
}

/** The causes with given line ends, as the generator's causes() computes them. */
function causesWith(tzif, lines, ends) {
  const stdAt = (s) => {
    const index = ends.findIndex((end) => s < end);
    return parseClock(lines[index === -1 ? lines.length - 1 : index][0]);
  };
  return tzif.t.map((s, index) => {
    const before = index === 0 ? 0 : tzif.typeOf[index - 1];
    const after = tzif.typeOf[index];
    const delta = tzif.offsets[after] - tzif.offsets[before];
    if (Math.abs(delta) >= DATE_LINE_SECONDS) return "x";
    if (stdAt(s - 1) !== stdAt(s)) return "l";
    if (delta !== 0 || tzif.isdst[after] !== tzif.isdst[before]) return "d";
    return "l";
  });
}

const iso = (s) => new Date(s * 1000).toISOString().replace(".000Z", "Z");
const builds = [
  ["main+backzone", compile(MAIN_FILES.filter((file) => file !== "backward").concat(BACKZONE)), new Map([...main.zones, ...backzone.zones])],
  ["main (default build)", compile(MAIN_FILES), main.zones]
];
const report = { tzdata: generator.TZDB_VERSION, zic: execFileSync(zic, ["--version"]).toString().trim(), builds: [] };
for (const [form, compiled, zones] of builds) {
  const changed = [];
  let transitions = 0;
  const ends = { checked: 0, onZicTransition: 0, before: { onZicTransition: 0, off: [] }, off: [] };
  for (const [name, lines] of [...zones].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const tzif = compiled.get(name);
    if (!tzif) continue;
    const endsNow = lineEnds(lines, tzif);
    const endsBefore = lineEndsBefore(lines, tzif);
    // The generator's causes() uses lineEnds; the same rule with the first cut's ends gives the old causes.
    const now = causes(tzif, lines);
    const before = causesWith(tzif, lines, endsBefore);
    transitions += tzif.t.length;
    tzif.t.forEach((s, index) => {
      if (now[index] === before[index]) return;
      const from = index === 0 ? 0 : tzif.typeOf[index - 1];
      const to = tzif.typeOf[index];
      changed.push({
        zone: name,
        at: iso(s),
        offsetMinutes: [tzif.offsets[from] / 60, tzif.offsets[to] / 60],
        abbreviations: [tzif.designations[from], tzif.designations[to]],
        before: before[index],
        after: now[index]
      });
    });
    // A wall-clock line end where the standard offset changes, with a zic transition near it, must be one of them.
    lines.forEach((line, index) => {
      if (index + 1 >= lines.length || line.length < 4) return;
      if (untilParts(line.slice(3)).kind !== "w" || parseClock(line[0]) === parseClock(lines[index + 1][0])) return;
      const near = tzif.t.filter((s) => Math.abs(s - endsNow[index]) <= 2 * 86400);
      if (!near.length) return;
      ends.checked += 1;
      const label = `${name}, line ${index + 1} (UNTIL ${line.slice(3).join(" ")})`;
      if (near.includes(endsNow[index])) ends.onZicTransition += 1;
      else ends.off.push(`${label}: ${iso(endsNow[index])}`);
      if (near.includes(endsBefore[index])) ends.before.onZicTransition += 1;
      else ends.before.off.push(`${label}: ${iso(endsBefore[index])}, zic ${near.map(iso).join(", ")}`);
    });
  }
  report.builds.push({
    form,
    zones: [...zones.keys()].filter((name) => compiled.has(name)).length,
    transitions,
    wallLineEndsChangingStandardOffset: ends,
    causesChanged: changed.length,
    changed
  });
}
const text = `${JSON.stringify(report, null, 1)}\n`;
if (process.argv[2]) writeFileSync(process.argv[2], text);
process.stdout.write(text);
