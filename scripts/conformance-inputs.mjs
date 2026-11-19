// The inputs of the conformance suite's position, angle and house vectors
// (conformance/vectors/0.2.0, L1 and L2), as births a test can give
// natalChart, read the way conformance/adapters/zodiacs-engine.mjs reads them:
// an L1 instant as TT with no place, an L2 instant as UT1 at its place, with
// the vector's house system where the engine has it and Porphyry otherwise.
// Only the inputs are used; the expected values are not.
import { readFileSync } from "node:fs";

const UNIX_EPOCH_JD = 2440587.5;
const DAY_MS = 86_400_000;
/** A Julian date as the nearest JavaScript millisecond. */
const dateOfJd = (jd) => new Date(Math.round((jd - UNIX_EPOCH_JD) * DAY_MS));
const SYSTEMS = { "whole-sign": "whole" };
const vectors = (name) =>
  JSON.parse(readFileSync(new URL(`../conformance/vectors/0.2.0/${name}`, import.meta.url), "utf8")).vectors;

/**
 * Every distinct L1 instant and every L2 vector, in the files' order, each as
 * `{ id, birth }`. `houseSystems` is the engine's HOUSE_SYSTEMS.
 */
export function conformanceBirths(houseSystems) {
  const births = [];
  const seen = new Set();
  for (const vector of vectors("L1-positions.json")) {
    if (seen.has(vector.input.jd_tt)) continue;
    seen.add(vector.input.jd_tt);
    births.push({ id: vector.id, birth: { utc: dateOfJd(vector.input.jd_tt), timeScale: "tt", timeKnown: false } });
  }
  for (const vector of vectors("L2-houses-angles.json")) {
    const system = SYSTEMS[vector.input.system] ?? vector.input.system;
    births.push({
      id: vector.id,
      birth: {
        utc: dateOfJd(vector.input.jd_ut1),
        timeScale: "ut1",
        timeKnown: true,
        latitude: vector.input.lat,
        longitude: vector.input.lon,
        houseSystem: houseSystems.includes(system) ? system : "porphyry"
      }
    });
  }
  return births;
}
