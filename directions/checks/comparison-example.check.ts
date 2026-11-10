import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PROGRESSION_DAYS_PER_YEAR, progressedBodies, progressedInstant
} from "../../src/index.js";
import { directLongitudes, solarArc } from "../../src/timing.js";
import { runExample } from "../examples/compare-techniques.js";
import { prepareNatal } from "../src/natal.js";

// These checks preserve public-helper wiring and documentation, not accuracy.
describe("separate technique comparison example integration", () => {
  it("runs the documented command and preserves the public helpers and explicit clocks", () => {
    const runner = fileURLToPath(new URL("../scripts/run-example.mjs", import.meta.url));
    const executed = spawnSync(process.execPath, [runner, "compare-techniques"], {
      encoding: "utf8", timeout: 30000, maxBuffer: 1048576
    });
    expect(executed.error).toBeUndefined();
    expect(executed.status, executed.stdout + executed.stderr).toBe(0);
    expect(executed.stderr).toBe("");
    const result = JSON.parse(executed.stdout) as ReturnType<typeof runExample>;
    expect(result).toEqual(runExample());
    expect(result.synthetic).toBe(true);
    expect(result.birth.timeScale).toBe("utc");
    expect(result.birth).not.toHaveProperty("deltaT");
    expect(result.primaryDirection).toMatchObject({
      status: "ok", kind: "conjunction-to-angle",
      convention: {
        system: "placidus-semiarc", mode: "mundane", latitude: "retain-both",
        motion: "direct", key: "ptolemy"
      },
      timing: { yearUnit: "tropical-365.2422-days" },
      natal: { timeScale: { input: "utc" } }
    });

    const { secondaryProgression: secondary, longitudeSolarArc: longitude } = result.comparisons;
    const birth = result.birth.utc;
    const target = result.comparisons.targetUtc;
    expect(result.primaryDirection).not.toHaveProperty("targetUtc");
    expect(secondary.elapsedYearDays).toBe(PROGRESSION_DAYS_PER_YEAR);
    expect(secondary.elapsedDayMilliseconds).toBe(86_400_000);
    expect(secondary.progressedUtc).toBe(progressedInstant(birth, target).toISOString());
    expect(secondary.bodies).toEqual(progressedBodies(birth, target));

    const arc = solarArc(birth, target);
    expect(longitude).toMatchObject({
      birthUtc: arc.birth.toISOString(), targetUtc: arc.target.toISOString(),
      progressedUtc: arc.progressed.toISOString(), natalSunLongitudeDegrees: arc.natalSun,
      progressedSunLongitudeDegrees: arc.progressedSun, arcLongitudeDegrees: arc.arc,
      flags: arc.flags
    });
    const natalRows = prepareNatal(result.birth).chart.bodies;
    expect(longitude.directedLongitudes).toEqual(directLongitudes(
      natalRows.map(row => ({ name: row.body, lon: row.lon })), arc.arc
    ));
    expect(longitude.progressedUtc).toBe(secondary.progressedUtc);
    expect(result.primaryDirection.timing.daysPerYear).toBe(secondary.elapsedYearDays);
  }, 35000);
});
