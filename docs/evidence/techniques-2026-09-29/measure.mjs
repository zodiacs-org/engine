#!/usr/bin/env node
/*
 * The measurements PREREGISTRATION.md names, run on the built package (run
 * `npm run build` first; TMPDIR outside the checkout):
 *
 *   node docs/evidence/techniques-2026-09-29/measure.mjs > measurements.json
 *
 * G1/G7  parity with the site's outputs (src/techniques/fixtures/site-parity/)
 * G2     solar returns against USNO season times
 * G3     returns against the Horizons Sun and Moon of the L1 vectors
 * G5     the root entry's graph against the carried rc.15 archive, the new
 *        entry's graph, and the unpacked size
 * G6     the sources under src/ changed since rc.15
 * G4 is the unit test in src/techniques/moon-sign.test.ts.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { natalChart } from "@zodiacs/engine";
import { prepareLocalTime } from "@zodiacs/engine/geo";
import { bodyLongitude } from "@zodiacs/engine/internal";
import { matchAspect } from "@zodiacs/engine/internal/math";
import * as techniques from "@zodiacs/engine/techniques";

import {
  checkComposite,
  checkDignities,
  checkMoonSigns,
  checkPatterns,
  checkReturns,
  checkVoidOfCourse,
  largestMsDifference
} from "../../../scripts/techniques-parity-check.mjs";

const root = new URL("../../../", import.meta.url);
const json = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const api = { ...techniques, bodyLongitude, matchAspect };
const fixture = (name) => json(`src/techniques/fixtures/site-parity/${name}.json`);

// ------------------------------------------------------------------ G1, G7
const moonExpected = fixture("moon-sign");
const results = [
  ...checkReturns(api, fixture("returns")),
  ...checkComposite(api, fixture("composite")),
  ...checkVoidOfCourse(api, fixture("void-of-course")),
  ...checkPatterns(api, fixture("aspect-patterns")),
  ...checkDignities(api, fixture("dignities")),
  ...(await checkMoonSigns(api, moonExpected, { compareMidnights: process.versions.tz === moonExpected.meta.tz, prepare: prepareLocalTime }))
];
const parity = results.map((result) => ({
  corpus: result.corpus,
  cases: result.cases,
  agree: result.agree,
  disagree: result.disagreements.length,
  largestMsDifference: largestMsDifference(result),
  // Every disagreement where one is recorded by design; the first five otherwise.
  disagreements: ["R-E", "M-P", "M-Z", "M-Z (signs over the site's endpoints)"].includes(result.corpus)
    ? result.disagreements
    : result.disagreements.slice(0, 5)
}));
const siteAnswered = results.find((row) => row.corpus === "R-E").disagreements.filter((row) => typeof row.site === "number");
const mp = results.find((row) => row.corpus === "M-P");
const G7 = {
  cases: mp.cases,
  disagree: mp.disagreements.length,
  everyDisagreementIsADifferentMidnight: mp.disagreements.every(
    (row) => Array.isArray(row.site) && Array.isArray(row.package) && (row.site[0] !== row.package[0] || row.site[1] !== row.package[1])
  )
};

// ---------------------------------------------------------------------- G2
const usno = json("src/techniques/fixtures/usno-seasons.json");
const usnoRows = usno.events.map(({ published, longitude }) => {
  const found = techniques.solarReturnInstant(longitude, `${published.slice(0, 10)}T00:00:00Z`);
  return { published, longitude, found: found.toISOString(), residualSeconds: (found.getTime() - Date.parse(published)) / 1000 };
});
const G2 = {
  gateSeconds: 120,
  events: usnoRows.length,
  maxAbsSeconds: Math.max(...usnoRows.map((row) => Math.abs(row.residualSeconds))),
  pass: usnoRows.every((row) => Math.abs(row.residualSeconds) <= 120),
  rows: usnoRows
};

// ---------------------------------------------------------------------- G3
const J2000_MS = Date.UTC(2000, 0, 1, 12);
/** The TT Julian date of an instant, rebuilt from its chart's own time record. */
const jdTT = (date) => {
  const chart = natalChart({ utc: date });
  const ut1Ms = date.getTime() + (chart.timeScale.ut1MinusUtc?.seconds ?? 0) * 1000;
  return 2451545 + (ut1Ms - J2000_MS) / 86_400_000 + chart.deltaT.seconds / 86_400;
};
const horizonsRows = json("conformance/vectors/L1-positions.json")
  .vectors.filter((vector) => vector.input.body === "Sun" || vector.input.body === "Moon")
  .map(({ id, input, expected }) => {
    const before = new Date((input.jd_tt - 2440587.5) * 86_400_000 - 10 * 86_400_000);
    const found = input.body === "Sun" ? techniques.solarReturnInstant(expected.lon, before) : techniques.lunarReturnInstant(expected.lon, before);
    return { id, body: input.body, jdTT: input.jd_tt, found: found.toISOString(), residualSeconds: (jdTT(found) - input.jd_tt) * 86_400 };
  });
const summary = (body, gate) => {
  const rows = horizonsRows.filter((row) => row.body === body);
  return { vectors: rows.length, gateSeconds: gate, maxAbsSeconds: Math.max(...rows.map((row) => Math.abs(row.residualSeconds))), pass: rows.every((row) => Math.abs(row.residualSeconds) <= gate) };
};
const G3 = { sun: summary("Sun", 60), moon: summary("Moon", 15), rows: horizonsRows };

// ---------------------------------------------------------------------- G5
const IMPORT = /^(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gmu;
function graph(directory, entry) {
  const files = new Map();
  const visit = (file) => {
    if (files.has(file)) return;
    const bytes = readFileSync(join(directory, file));
    files.set(file, { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    for (const match of bytes.toString("utf8").matchAll(IMPORT)) {
      const specifier = match[1] ?? match[2];
      if (specifier.startsWith("./")) visit(`dist/${specifier.slice(2)}`);
    }
  };
  visit(entry);
  return files;
}
const total = (files) => [...files.values()].reduce((sum, file) => sum + file.bytes, 0);
const here = new URL(".", root).pathname;
const scratch = mkdtempSync(join(tmpdir(), "techniques-measure-"));
execFileSync("tar", ["-xzf", new URL("artifacts/zodiacs-engine-0.1.1-rc.15.tgz", root).pathname, "-C", scratch]);
const archived = graph(join(scratch, "package"), "dist/index.js");
const archivedGeo = graph(join(scratch, "package"), "dist/geo.js");
rmSync(scratch, { recursive: true, force: true });
const built = graph(here, "dist/index.js");
const coreFiles = built;
const builtGeo = graph(here, "dist/geo.js");
const techniquesGraph = graph(here, "dist/techniques.js");
const pack = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: here, encoding: "utf8" }))[0];
const G5 = {
  root: {
    rc15ArchiveBytes: total(archived),
    builtBytes: total(built),
    sameFilesAndBytes:
      archived.size === built.size && [...archived].every(([file, record]) => built.get(file)?.sha256 === record.sha256)
  },
  techniques: {
    files: techniquesGraph.size,
    bytes: total(techniquesGraph),
    beyondCore: [...techniquesGraph].filter(([file]) => !coreFiles.has(file)).reduce((sum, [, record]) => sum + record.bytes, 0),
    ceiling: 150_000
  },
  // ./geo now shares its local-time chunk with ./techniques.
  geo: { rc15ArchiveBytes: total(archivedGeo), builtBytes: total(builtGeo), difference: total(builtGeo) - total(archivedGeo), ceiling: 35_000 },
  unpacked: { bytes: pack.unpackedSize, files: pack.entryCount, cap: 700_000 }
};

// ---------------------------------------------------------------------- G6
const changed = execFileSync("git", ["diff", "--name-status", "eb58011", "--", "src"], { cwd: here, encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => line.split("\t"));
const G6 = {
  since: "eb58011",
  added: changed.filter(([status]) => status === "A").map(([, file]) => file),
  changedOrRemoved: changed.filter(([status]) => status !== "A").map(([status, file]) => `${status} ${file}`)
};

console.log(
  JSON.stringify(
    {
      meta: {
        script: "docs/evidence/techniques-2026-09-29/measure.mjs",
        head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: here, encoding: "utf8" }).trim(),
        node: process.version,
        tz: process.versions.tz ?? null,
        engine: techniques && JSON.parse(readFileSync(new URL("package.json", root), "utf8")).version
      },
      G1: parity,
      siteAnsweredOutsideSpan: siteAnswered,
      G2,
      G3,
      G5,
      G6,
      G7
    },
    null,
    1
  )
);
