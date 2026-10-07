// The checks that scripts/verify-packed-consumer.mjs now makes of 1.0's
// additions, its Stockholm zone-history check by the error's class and the
// new section oneZeroAdditions, one by one, so that each can be seen to pass
// on a 1.0 candidate and to fail on rc.17. rc.17 takes an epoch's scale in
// upper case, "TT", and 1.0 in lower case: the epoch checks write it as the
// package takes it, so that on rc.17 they fail on what it computes or
// refuses, not on how the scale is spelled.
// The package directory, an unpacked archive, is copied into a temporary
// directory's node_modules as @zodiacs/engine, beside a link to
// astronomy-engine, and the checks run there in their own process.
//
//   node consumer-additions.mjs <unpacked package> <astronomy-engine package>
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [packageDirectory, astronomyDirectory] = process.argv.slice(2).map((path) => resolve(path));
if (!packageDirectory || !astronomyDirectory) throw new Error("usage: node consumer-additions.mjs <unpacked package> <astronomy-engine package>");

const checks = `import assert from "node:assert/strict";
const results = {};
const run = async (name, fn) => { try { await fn(); results[name] = "pass"; } catch (error) { results[name] = "fail: " + String(error?.message ?? error).split("\\n")[0].slice(0, 100); } };
const geoEntry = await import("@zodiacs/engine/geo");
const calcEntry = await import("@zodiacs/engine/calc");
const rootEntry = await import("@zodiacs/engine");
const housesEntry = await import("@zodiacs/engine/houses");
await run("ZoneHistoryNotLoadedError by its class", () => assert.throws(() => geoEntry.resolveLocalToUtc("1947-07-01", "12:00", "Europe/Stockholm"), (error) => error instanceof geoEntry.ZoneHistoryNotLoadedError && /prepareLocalTime/.test(error.message)));
// The scale as the package takes it: "tt", or rc.17's "TT".
const epochCalc = (jd, value) => {
  const input = (scale) => ({body: "Moon", time: "2000-02-29", zodiac: {sidereal: {epoch: {jd, scale}, value}}});
  try {
    return calcEntry.calc(input("tt"));
  } catch (error) {
    if (!(error instanceof RangeError) || !/scale/.test(error.message)) throw error;
    return calcEntry.calc(input("TT"));
  }
};
await run("an epoch inside EPHEMERIS_SPAN before 1800 computed", () => assert.equal(epochCalc(2086302.5, 10.5).status, "ok"));
await run("epoch-out-of-range", () => {
  const farEpoch = epochCalc(0.5, 23.85);
  assert.equal(farEpoch.status, "refused");
  assert.equal(farEpoch.reason, "epoch-out-of-range");
});
await run("the refusal's epochSpan is EPHEMERIS_SPAN", () => {
  const farEpoch = epochCalc(0.5, 23.85);
  assert(rootEntry.EPHEMERIS_SPAN !== undefined && farEpoch.epochSpan === rootEntry.EPHEMERIS_SPAN);
});
await run("signForLongitude returns SIGNS' frozen entry", () => {
  const aries = rootEntry.signForLongitude(15);
  assert(aries === rootEntry.SIGNS[0] && Object.isFrozen(aries));
});
await run("matchAspect returns ASPECTS' frozen entry", () => {
  const trine = rootEntry.matchAspect("Sun", 0, "Mars", 120)?.definition;
  assert(rootEntry.ASPECTS.includes(trine) && Object.isFrozen(trine));
});
for (const name of ["SIGNS", "ASPECTS", "ASPECT_TYPES", "SIGN_SLUGS", "SIGN_NAMES", "ELEMENTS", "MODALITIES", "HOUSE_SYSTEMS", "POLAR_UNDEFINED_HOUSE_SYSTEMS", "LOTS"]) {
  await run("frozen " + name, () => assert(Array.isArray(rootEntry[name]) && Object.isFrozen(rootEntry[name]), name));
}
await run("SIGNS' and ASPECTS' entries frozen", () => assert(rootEntry.SIGNS.every(Object.isFrozen) && rootEntry.ASPECTS.every(Object.isFrozen)));
await run("SIGN_NAMES is SIGN_SLUGS", () => assert.equal(rootEntry.SIGN_NAMES, rootEntry.SIGN_SLUGS));
for (const name of ["CALC_BODIES", "CALC_AYANAMSAS", "CALC_FRAMES"]) {
  await run("frozen " + name, () => assert(Array.isArray(calcEntry[name]) && Object.isFrozen(calcEntry[name]), name));
}
await run("SIDEREAL_TIME_RATE, and SIDEREAL_RATE the same number", () => {
  assert.equal(typeof housesEntry.SIDEREAL_TIME_RATE, "number");
  assert.equal(housesEntry.SIDEREAL_RATE, housesEntry.SIDEREAL_TIME_RATE);
});
console.log(JSON.stringify({ version: rootEntry.ENGINE_VERSION, ...results }));
`;

const work = mkdtempSync(join(tmpdir(), "consumer-additions-"));
try {
  mkdirSync(join(work, "node_modules/@zodiacs"), { recursive: true });
  cpSync(packageDirectory, join(work, "node_modules/@zodiacs/engine"), { recursive: true });
  symlinkSync(astronomyDirectory, join(work, "node_modules/astronomy-engine"), "dir");
  writeFileSync(join(work, "checks.mjs"), checks);
  process.stdout.write(execFileSync(process.execPath, [join(work, "checks.mjs")], { cwd: work, encoding: "utf8" }));
} finally {
  rmSync(work, { recursive: true, force: true });
}
