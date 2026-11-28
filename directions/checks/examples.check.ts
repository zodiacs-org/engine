import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runExample as pureExample } from "../examples/pure-api.js";
import { runExample as natalExample, syntheticBirth } from "../examples/natal-api.js";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("runnable guide examples", () => {
  it("retains the independent equatorial hit and scan derivations", () => {
    // M8 zodiacal-wrap-ptolemy: zero obliquity projects RA to longitude,
    // and (10 - 350) mod 360 = 20 degrees. M9 equatorial conjunction:
    // (60 - 330) mod 360 = 90; the role-swapped arc is 270.
    const result = pureExample();
    expect(result.contact.arcDegrees).toBe(20);
    expect(result.contact.directedAgeYears).toBe(20);
    expect(result.contacts.hits.map(row => row.hit.arcDegrees)).toEqual([90, 270]);
    expect(result.contacts.hits.map(row => row.hit.directedAgeYears)).toEqual([90, 270]);
    expect(result.contacts.hits.map(row => row.hit.convention.motion)).toEqual(["direct", "converse"]);
  });

  it("keeps the natal clock, solar samples and provenance together (integration only)", () => {
    const result = natalExample();
    expect(result.solarRequest.birth).toEqual(syntheticBirth);
    expect(result.solarHit.natal.instantLabel).toBe("2000-01-01T12:00:00.000Z");
    expect(result.solarHit.natal.timeScale.input).toBe("tt");
    expect(result.solarHit.natal.solarEpochAssociation).toBe("caller-supplied-unverified");
    expect(result.solarRequest.request.solar.start.jdTt).toBe(2451545);
    expect(result.solarRequest.request.solar.end.jdTt).toBe(2451546);
    expect(result.solarProvenance.resolutionReceipt.instants[0]?.jdTt).toBe(2451545);
    expect(result.solarProvenance.start.receipt.instants[0]?.jdTt).toBe(2451545);
    expect(result.solarProvenance.end.receipt.instants[0]?.jdTt).toBe(2451546);
    expect(result.fixedHit.arcDegrees).toBe(result.solarHit.arcDegrees);
    expect(result.fixedHit.convention.key).toBe("naibod");
    expect(result.solarHit.convention.key).toBe("solar-equatorial-birth-day");
    expect(result.contacts.hits).toHaveLength(2);
  });

  for (const name of ["pure-api", "natal-api"]) {
    it(`bundles and runs ${name} with the documented runner`, () => {
      const result = spawnSync(process.execPath, [resolve(project, "scripts/run-example.mjs"), name], {
        cwd: resolve(project, ".cache"), encoding: "utf8", timeout: 30000, maxBuffer: 2_000_000
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toBeTypeOf("object");
    }, 35000);
  }
});
