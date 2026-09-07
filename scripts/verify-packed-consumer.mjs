import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const artifactArgument = process.argv[2];
assert(artifactArgument, "Usage: consumer:smoke /absolute/path/to/engine.tgz");
assert(isAbsolute(artifactArgument), "Pass the exact packed artifact as an absolute path.");
const artifact = realpathSync(artifactArgument);
const directory = mkdtempSync(join(tmpdir(), "zodiacs-engine-consumer-"));
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const run = (command, args) =>
  execFileSync(command, args, {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000
  });
writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
// This creates a real consumer dependency tree, with no workspace aliases or
// links. Ignore lifecycle scripts; neither this ESM package nor tsc needs one.
run("npm", [
  "install",
  "--ignore-scripts",
  "--no-audit",
  "--no-fund",
  artifact,
  "typescript@5.9.3"
]);
const installed = JSON.parse(
  readFileSync(join(directory, "node_modules/@zodiacs/engine/package.json"), "utf8")
);
assert.equal(installed.version, manifest.version);
assert(
  realpathSync(join(directory, "node_modules/@zodiacs/engine")).startsWith(realpathSync(directory))
);
for (const name of ["LICENSE", "LICENSING.md", "NOTICE"]) {
  assert(readFileSync(join(directory, "node_modules/@zodiacs/engine", name), "utf8").length > 0);
}
writeFileSync(
  join(directory, "consumer.ts"),
  `
import { natalChart, transits, synastry, moonPhase, positions, type Chart } from "@zodiacs/engine";
import { resolveBirth } from "@zodiacs/engine/geo";
const chart: Chart = natalChart(resolveBirth({date: "2000-02-29", time: "12:00", timeZone: "UTC", latitude: 0, longitude: 180}));
transits(chart, "2026-09-07T12:00:00Z");
synastry(chart, { utc: "2001-01-01", timeKnown: false });
moonPhase("2024-04-08T18:21:00Z");
positions(0);
`
);
run(process.execPath, [
  resolve(directory, "node_modules/typescript/bin/tsc"),
  "--strict",
  "--module",
  "nodenext",
  "--target",
  "ES2022",
  "--noEmit",
  "consumer.ts"
]);
writeFileSync(
  join(directory, "consumer.mjs"),
  `
import assert from "node:assert/strict";
import { natalChart, positions, transits, synastry, moonPhase, ENGINE_VERSION } from "@zodiacs/engine";
import { resolveBirth } from "@zodiacs/engine/geo";
globalThis.fetch = () => { throw new Error("Calculation attempted a network request"); };
const chart = natalChart({utc: "2001-12-21T00:00:00Z", latitude: 78.2232, longitude: 15.6267, houseSystem: "placidus"});
assert.equal(chart.houses.system, "whole");
assert(chart.flags.includes("polar-fallback"));
assert(((chart.angles.asc-chart.angles.mc+360)%360) < 180);
assert.equal(chart.houses.cusps[0], Math.floor(chart.angles.asc/30)*30);
assert.equal(positions("2000-02-29").length, 12);
assert.equal(transits(chart, "2026-09-07T12:00:00Z").positions.length, 12);
assert(synastry(chart, {utc: "2000-01-01", timeKnown: false}).aspects.length > 0);
assert(moonPhase("2024-04-08T18:21:00Z").illumination < 0.001);
const unknown = natalChart(resolveBirth({date: "2000-02-29", timeZone: "UTC", timeKnown: false}));
assert.equal(unknown.angles, null);
assert.equal(unknown.houses, null);
assert(unknown.flags.includes("no-time"));
assert.throws(() => natalChart({utc: "2023-02-29T12:00:00Z"}), RangeError);
assert.throws(() => natalChart({utc: "2000-01-01T12:00:00"}), RangeError);
assert.throws(() => natalChart({utc: "2000-01-01", houseSystem: "unsupported"}), RangeError);
for (const name of ["react", "@zodiacs/sdk"]) {
  assert.throws(() => import.meta.resolve(name), {code: "ERR_MODULE_NOT_FOUND"});
}
console.log(JSON.stringify({version: ENGINE_VERSION, publicExamples: "passed", errors: "passed", optionalIsolation: "passed"}));
`
);
const result = JSON.parse(run(process.execPath, ["consumer.mjs"]).trim());
console.log(
  JSON.stringify(
    {
      ...result,
      artifact,
      sha256: createHash("sha256").update(readFileSync(artifact)).digest("hex"),
      runtime: process.version,
      typescript: "5.9.3",
      directory,
      types: "passed"
    },
    null,
    2
  )
);
