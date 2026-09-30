#!/usr/bin/env node
/*
 * Runs the Zodiacs.org site's code on the parity corpus
 * (scripts/techniques-parity-corpus.mjs) and writes its outputs, the
 * expected values of src/techniques/site-parity.test.ts.
 *
 *   node site-parity.mjs --snapshot DIR --engine DIR --work DIR --out DIR
 *
 * --snapshot  a copy of the site repository (at least src/lib and
 *             src/islands/aspect-patterns, and a SITE_COMMIT file naming the
 *             commit it was copied from). Never the site's own working tree:
 *             this script writes one extracted module into the copy.
 * --engine    the extracted 0.1.1-rc.15 archive (its `package/` directory);
 *             the site's `@zodiacs/engine` imports resolve to it.
 * --work      a scratch directory outside both repositories.
 * --out       where the JSON outputs go.
 *
 * The site's modules are bundled with esbuild (the engine repository's copy)
 * with `@zodiacs/engine` and `astronomy-engine` left external, so they run on
 * the same ephemeris as the package. Every site file read is checked against
 * the SHA-256 in PREREGISTRATION.md before anything runs.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  chartProjection,
  compositeCorpus,
  compositeProjection,
  containmentProjection,
  digest32,
  dignityCorpus,
  moonSignCorpus,
  patternCorpus,
  patternProjection,
  returnsCorpus,
  voidCorpus
} from "../../../scripts/techniques-parity-corpus.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const engineRepo = resolve(here, "../../..");
const require = createRequire(join(engineRepo, "package.json"));

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => (index % 2 === 0 ? [...pairs, [value.replace(/^--/u, ""), all[index + 1]]] : pairs), [])
);
for (const key of ["snapshot", "engine", "work", "out"]) {
  if (!args[key]) throw new Error(`missing --${key}`);
}
const snapshot = resolve(args.snapshot);
const engineDir = resolve(args.engine);
const work = resolve(args.work);
const out = resolve(args.out);

/** The site files read, with the SHA-256 preregistered for each. */
const SITE_FILES = {
  "src/lib/engine/solar-return.ts": "723b4cb6748b0a9dca7cbb55d4359339434cf69cdf2d6b23d43ed9e99dc6bfc0",
  "src/lib/engine/lunar-return.ts": "7ac26ad065eeaa117d852b22165e2b870539c25acba2dfb37073275943876bc5",
  "src/lib/engine/returns.ts": "d0eed21f5a213fef3c8576ab5e726f6c27fc00edc95980fabad2843852937cfb",
  "src/lib/engine/reference-span.ts": "a71e7f014efab7fad511318aec311abb973181c3abf2f2e60e16720ed0282688",
  "src/lib/engine/full.ts": "2f34bf48efd52d47fa9771b2373d4d5f696616b4e3faf6a4ec784190782ae624",
  "src/lib/engine/chart-adapter.ts": "12cbde8ea2b1704c1fd5a6a87200621a9719b078e3461a9dcfb506527d6f44f1",
  "src/lib/engine/types.ts": "1c5665a9621f78da2c10ce8e17dbeafdb2fdb379faf2c80df5391efab015ad99",
  "src/lib/engine/aspects.ts": "0faaa80258494bee18bb5247291a8ecbe0abc9554775c5f0c43b8d0f00c2660f",
  "src/lib/composite.ts": "1860ab8de9fca12bc9575c7bbc2c662eb14cb088376f53f03680ee8c37305cd3",
  "src/lib/engine/void-of-course.ts": "927ed5b280317085ab963a8b9992b31544470c1dafe0904c9e319ffe569334c0",
  "src/lib/engine/aspect-patterns.ts": "df62a2f7b98a6305b79905a6b26a5cf1f2ce98d7df45a7c911c9331eec83f6cb",
  "src/lib/aspect-pattern-model.ts": "3718bc63a0c46e7ba099e9233382b94192f65d3b5a49ce9edc3d36cc6eb05455",
  "src/lib/dignities.ts": "7e8593064ff20e0229a7701186fc834002988ced88bc58e2701f1ca4081ca5ac",
  "src/lib/moon-certainty.ts": "a1786be7d1734b7c58eda862f900a3a1081c944c1e4efc6a131bb0bcdcf3e994",
  "src/lib/chart-date-certainty.ts": "2ba8257d01516622ae425b7b6d8a16ff16831f6e6f2fb9b4ad21b3b354afc936",
  "src/lib/share-card.ts": "09448ff3f5625c7c8789434e24fc1f576eb4a7019075850152ce86ef09811af4",
  "src/lib/share-positions-noon.ts": "6a006703f49b4d4c53859de4b8d63f5c5ab5aab3ba3c91c3f2c2e9508dc6ef65",
  "src/lib/signs.ts": "1c63218d01b33b963106fb1c11030816833b0d6a79f9f765df433830ef5cfaa4",
  "src/lib/time/localToUtc.ts": "671b66fdc437f68c543d910b77552d93ca4cba9f10a5a60dd9a2124f6eb1a7c5"
};
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
for (const [file, expected] of Object.entries(SITE_FILES)) {
  const actual = sha256(readFileSync(join(snapshot, file)));
  if (actual !== expected) throw new Error(`${file} is not the preregistered file: ${actual}`);
}
const siteCommit = readFileSync(join(snapshot, "SITE_COMMIT"), "utf8").trim();

// untimedMoonSign lives in share-card.ts, whose other imports need a browser
// canvas. Its text, from `const HOUR_MS` to the end of referenceInstant, is
// copied unchanged into a module beside it in the snapshot.
const shareCard = readFileSync(join(snapshot, "src/lib/share-card.ts"), "utf8");
const start = shareCard.indexOf("const HOUR_MS = 3_600_000;");
const end = shareCard.indexOf("export const SHARE_CARD_SCALE");
if (start < 0 || end < start) throw new Error("untimedMoonSign not found in share-card.ts");
const untimedText = shareCard.slice(start, end);
writeFileSync(join(snapshot, "src/lib/__parity-untimed-moon-sign.ts"), `import { signForLongitude } from './signs';\n\n${untimedText}`);

// The run directory: the externals resolve from its node_modules.
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, "node_modules/@zodiacs"), { recursive: true });
symlinkSync(engineDir, join(work, "node_modules/@zodiacs/engine"), "dir");
// The engine repository's installed copy (its package.json is not exported).
const astronomyDir = join(engineRepo, "node_modules/astronomy-engine");
const astronomyVersion = JSON.parse(readFileSync(join(astronomyDir, "package.json"), "utf8")).version;
if (astronomyVersion !== "2.1.19") throw new Error(`astronomy-engine ${astronomyVersion}, expected 2.1.19`);
symlinkSync(astronomyDir, join(work, "node_modules/astronomy-engine"), "dir");
const engineVersion = JSON.parse(readFileSync(join(engineDir, "package.json"), "utf8")).version;

const lib = (file) => JSON.stringify(join(snapshot, "src/lib", file));
writeFileSync(
  join(work, "entry.ts"),
  [
    `export * as solar from ${lib("engine/solar-return.ts")};`,
    `export * as lunar from ${lib("engine/lunar-return.ts")};`,
    `export * as returns from ${lib("engine/returns.ts")};`,
    `export * as full from ${lib("engine/full.ts")};`,
    `export * as aspects from ${lib("engine/aspects.ts")};`,
    `export * as composite from ${lib("composite.ts")};`,
    `export * as voc from ${lib("engine/void-of-course.ts")};`,
    `export * as patterns from ${lib("engine/aspect-patterns.ts")};`,
    `export * as patternModel from ${lib("aspect-pattern-model.ts")};`,
    `export * as dignities from ${lib("dignities.ts")};`,
    `export * as moon from ${lib("moon-certainty.ts")};`,
    `export * as dateCertainty from ${lib("chart-date-certainty.ts")};`,
    `export * as untimed from ${lib("__parity-untimed-moon-sign.ts")};`
  ].join("\n")
);

const esbuild = require("esbuild");
await esbuild.build({
  entryPoints: [join(work, "entry.ts")],
  outfile: join(work, "site-bundle.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  external: ["@zodiacs/engine", "@zodiacs/engine/*", "astronomy-engine"],
  define: { "import.meta.env.SSR": "true" },
  logLevel: "warning",
  plugins: [
    {
      // Loaded by resolveLocalToUtc only for a birthplace longitude, which no
      // input here passes.
      name: "no-birthplace-clock",
      setup(build) {
        build.onResolve({ filter: /\/birthplace-clock$/ }, () => ({ path: "birthplace-clock", namespace: "stub" }));
        build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents: "export {}; throw new Error('the birthplace clock is not part of the parity run');",
          loader: "js"
        }));
      }
    }
  ]
});
const site = await import(pathToFileURL(join(work, "site-bundle.mjs")).href);

const attempt = (run) => {
  try {
    return { value: run() };
  } catch (error) {
    return { error: error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error) };
  }
};
const SIGN_LETTERS = "abcdefghijkl";
const SIGN_SLUGS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];

// ---------------------------------------------------------------- returns
const returns = returnsCorpus();
const sunAt = (ms) => site.full.bodyLongitude("Sun", new Date(ms));
const moonAt = (ms) => site.full.bodyLongitude("Moon", new Date(ms));
const instantOrError = (run) => {
  const result = attempt(run);
  return "error" in result ? { error: result.error } : result.value.getTime();
};
const chartRecord = (run) => {
  const result = attempt(run);
  if ("error" in result) return { error: result.error };
  const projection = chartProjection(result.value);
  return [projection.utc, digest32(projection)];
};
const castOf = (row) => (row.cast === null ? null : row.cast === "natal" ? { latitude: row.latitude, longitude: row.longitude } : row.cast);
const returnsOut = {
  RSI: returns.RSI.map((row) => instantOrError(() => site.solar.solarReturnInstant(sunAt(row.birth), new Date(row.near)))),
  RSM: returns.RSM.map((row) => instantOrError(() => site.solar.mostRecentSolarReturnInstant(sunAt(row.birth), new Date(row.at)))),
  RSC: returns.RSC.map((row) =>
    chartRecord(() => site.solar.solarReturnChart(sunAt(row.birth), new Date(row.near), castOf(row), row.houseSystem, row.selection))
  ),
  RLI: returns.RLI.map((row) => instantOrError(() => site.lunar.lunarReturnInstant(moonAt(row.birth), new Date(row.after)))),
  RLC: returns.RLC.map((row) =>
    chartRecord(() =>
      site.lunar.lunarReturnChart(
        { utc: new Date(row.birth), latitude: row.latitude, longitude: row.longitude, houseSystem: row.houseSystem, timeKnown: true },
        new Date(row.after),
        row.cast === "natal" ? undefined : row.cast
      )
    )
  ),
  RE: returns.RE.map((row) => {
    if (row.fn === "solarReturnInstant") return instantOrError(() => site.solar.solarReturnInstant(sunAt(row.birth), new Date(row.date)));
    if (row.fn === "mostRecentSolarReturnInstant") {
      return instantOrError(() => site.solar.mostRecentSolarReturnInstant(sunAt(row.birth), new Date(row.date)));
    }
    if (row.fn === "lunarReturnInstant") return instantOrError(() => site.lunar.lunarReturnInstant(moonAt(row.birth), new Date(row.date)));
    return chartRecord(() =>
      site.lunar.lunarReturnChart(
        { utc: new Date(row.birth), latitude: row.latitude, longitude: row.longitude, houseSystem: "placidus", timeKnown: true },
        new Date(row.date)
      )
    );
  })
};

// -------------------------------------------------------------- composite
const composite = compositeCorpus().map(({ a, b }) => {
  const points = site.composite.compositeMidpoints(a, b);
  const aspects = site.composite.compositeAspects(points);
  return [points.length, aspects.length, digest32(compositeProjection(points, aspects))];
});

// --------------------------------------------------------- void of course
const voidInputs = voidCorpus();
const bodiesOf = (name) => (name === "modern" ? site.voc.VOID_BODIES_MODERN : site.voc.VOID_BODIES_TRADITIONAL);
const windowRecord = (window) =>
  window && [
    window.from.getTime(),
    window.to.getTime(),
    window.lastAspect && [window.lastAspect.at.getTime(), window.lastAspect.body, window.lastAspect.aspect, window.lastAspect.moonLon],
    window.signIndex,
    window.nextSignIndex
  ];
const voidOut = {
  VW: voidInputs.VW.map((row) =>
    site.voc.voidOfCourseWindows(new Date(row.from), new Date(row.to), { bodies: bodiesOf(row.bodies) }).map(windowRecord)
  ),
  VS: voidInputs.VS.map((row) => {
    const status = site.voc.voidStatus(new Date(row.at), { bodies: bodiesOf(row.bodies) });
    return [status.isVoid, windowRecord(status.current), windowRecord(status.next)];
  })
};

// -------------------------------------------------------- aspect patterns
const siteMatch = (aBody, aLon, bBody, bLon) => {
  const match = site.aspects.matchAspect(aBody, aLon, bBody, bLon);
  return match ? { type: match.def.type, orb: match.orb } : null;
};
const patternsOut = patternCorpus(siteMatch).map(({ points, edges }) => {
  const detection = site.patterns.detectAspectPatterns(points, edges);
  if (detection.status !== "ready") return { unavailable: detection.reason };
  const containment = site.patternModel.patternContainment(detection.patterns);
  return [
    detection.patterns.length,
    digest32(patternProjection(detection.points, detection.patterns)),
    digest32(containmentProjection(containment))
  ];
});

// -------------------------------------------------------------- dignities
const dignitiesOut = dignityCorpus().map(({ planet, sign }) => [
  site.dignities.dignityFor(planet, sign),
  [...site.dignities.dignitiesFor(planet, sign)],
  site.dignities.hasClassicalDignities(planet)
]);

// -------------------------------------------------------------- Moon signs
const moonInputs = moonSignCorpus();
const MA = [];
for (const date of moonInputs.MA) {
  const sign = await site.untimed.untimedMoonSign(date);
  MA.push(sign === null ? "-" : SIGN_LETTERS[SIGN_SLUGS.indexOf(sign)]);
}
const zoned = (row) => {
  const result = attempt(() => {
    const endpoints = site.dateCertainty.localDateEndpointsUtc(row.date, row.timeZone);
    const signs = site.moon.moonCandidatesFromEndpoints(
      site.full.computeBodies(endpoints.start),
      site.full.computeBodies(endpoints.end)
    );
    const noon = Date.parse(`${row.date}T12:00:00Z`);
    return [endpoints.start.getTime() - noon, endpoints.end.getTime() - noon, signs.map((slug) => SIGN_LETTERS[SIGN_SLUGS.indexOf(slug)]).join("")];
  });
  return "error" in result ? { error: result.error } : result.value;
};
const moonOut = { MA: MA.join(""), MZ: moonInputs.MZ.map(zoned), MP: moonInputs.MP.map(zoned) };

// ------------------------------------------------------------------ write
const meta = {
  generatedBy: "docs/evidence/techniques-2026-09-29/site-parity.mjs",
  siteCommit,
  siteFiles: SITE_FILES,
  untimedMoonSignExtract: sha256(untimedText),
  engine: engineVersion,
  astronomyEngine: astronomyVersion,
  node: process.version,
  tz: process.versions.tz ?? null
};
mkdirSync(out, { recursive: true });
const write = (name, data) => writeFileSync(join(out, name), `${JSON.stringify({ meta, ...data })}\n`);
write("returns.json", returnsOut);
write("composite.json", { cases: composite });
write("void-of-course.json", voidOut);
write("aspect-patterns.json", { cases: patternsOut });
write("dignities.json", { cases: dignitiesOut });
write("moon-sign.json", moonOut);
if (existsSync(join(snapshot, "src/lib/__parity-untimed-moon-sign.ts"))) rmSync(join(snapshot, "src/lib/__parity-untimed-moon-sign.ts"));
console.log(`site outputs written to ${out} (site ${siteCommit.slice(0, 8)}, engine ${engineVersion}, ${process.version}, tz ${meta.tz})`);
