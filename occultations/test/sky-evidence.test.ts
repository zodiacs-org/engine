import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { timeBasis } from "../../src/time-scale.js";
import { contactSkyFacts } from "../src/contact-sky.js";
import { positionAt, type PositionResult } from "../src/engine.js";
import { normalizeObserver } from "../src/input.js";

interface SourceRecord {
  readonly url: string;
  readonly responseSha256: string;
  readonly apiVersion: string;
}
interface AltitudeReference extends SourceRecord {
  readonly date: string;
  readonly timeUt1: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly selectedFields: {
    readonly "properties.data[object=Sun].almanac_data.hc": number;
    readonly "properties.data[object=Sun].altitude_corrections.pa": number;
  };
}
type PrimaryPhase = "New Moon" | "First Quarter" | "Full Moon" | "Last Quarter";
interface PhaseReference {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly time: string;
  readonly phase: PrimaryPhase;
}
interface PolarReference extends SourceRecord {
  readonly date: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly selectedFields: {
    readonly "properties.data.sundata": readonly { readonly phen: string; readonly time: string | null }[];
  };
}
const references = JSON.parse(readFileSync(new URL("./fixtures/sky/usno-sky.json", import.meta.url), "utf8")) as {
  readonly altitudes: readonly AltitudeReference[];
  readonly phases: SourceRecord & { readonly phasedata: readonly PhaseReference[] };
  readonly polar: readonly PolarReference[];
};
const riseSet = JSON.parse(readFileSync(new URL("../../src/sky/fixtures/usno-rstt.json", import.meta.url), "utf8")) as {
  readonly days: readonly {
    readonly date: string; readonly latitude: number; readonly longitude: number;
    readonly events: readonly (readonly ["Sun" | "Moon", string, string])[];
  }[];
};

// Nominal UT1 calendar labels are not silently treated as UTC.
function inputAtUt1(date: string, time: string): string {
  return new Date(timeBasis(Date.parse(`${date}T${time}Z`), "ut1").utcMs).toISOString();
}

function requirePosition(result: PositionResult): Extract<PositionResult, { readonly status: "ok" }> {
  expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error("Sky reference position was refused");
  return result;
}

// Exercise the same assembly used at contact times. Mercury is only a valid
// direction supplied to this internal helper; no occultation is asserted here.
function skyAt(at: string, latitude: number, longitude: number) {
  const observer = normalizeObserver({ latitude, longitude, elevationMeters: 0 });
  const moon = requirePosition(positionAt({ body: "Moon", time: at, observer }));
  const target = requirePosition(positionAt({ body: "Mercury", time: at, observer }));
  const sun = requirePosition(positionAt({ body: "Sun", time: at, observer }));
  const sky = contactSkyFacts(at, observer, moon, target, sun);
  expect(sky.receipt.request).toEqual({ at, observer });
  expect(sky.receipt.schema).toBe("zodiacs.occultations.contact-sky-receipt.v1");
  return sky;
}

describe("independent USNO sky-context development evidence", () => {
  it("retains every preregistered source row and provenance field", () => {
    expect(references.altitudes).toHaveLength(4);
    expect(references.phases.phasedata.map((row) => row.phase)).toEqual([
      "Last Quarter", "New Moon", "First Quarter", "Full Moon"
    ]);
    expect(references.phases.phasedata.map((row) => [row.year, row.month, row.day])).toEqual([
      [2024, 1, 4], [2024, 1, 11], [2024, 1, 18], [2024, 1, 25]
    ]);
    expect(references.polar.map((row) => row.date)).toEqual(["2024-06-21", "2024-12-21"]);
    for (const row of [...references.altitudes, references.phases, ...references.polar]) {
      expect(row.url).toMatch(/^https:\/\/aa\.usno\.navy\.mil\/api\//);
      expect(row.responseSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(row.apiVersion).toBe("4.0.1");
    }
    expect(riseSet.days).toHaveLength(3);
    expect(riseSet.days.flatMap((day) => day.events.filter(([, kind]) => kind === "rise" || kind === "set")))
      .toHaveLength(10);
  });

  it.each(references.altitudes)("solar geometric altitude agrees within 0.02 degree at $date $timeUt1 UT1", (row) => {
    const sky = skyAt(inputAtUt1(row.date, row.timeUt1), row.latitude, row.longitude);
    const expected = row.selectedFields["properties.data[object=Sun].almanac_data.hc"] -
      row.selectedFields["properties.data[object=Sun].altitude_corrections.pa"];
    expect(Number.isFinite(sky.sun.geometricAltitudeDegrees)).toBe(true);
    expect(Math.abs(sky.sun.geometricAltitudeDegrees - expected)).toBeLessThanOrEqual(0.02);
    expect(sky.sun.aboveGeometricHorizon).toBe(true);
  });

  it("brackets every published Sun/Moon rise and set within 120 seconds each side", () => {
    let checked = 0;
    for (const day of riseSet.days) for (const [body, kind, time] of day.events) {
      if (kind !== "rise" && kind !== "set") continue;
      const labelMs = Date.parse(`${day.date}T${time}:00Z`);
      const samples = [-120_000, 120_000].map((offset) => {
        const at = new Date(timeBasis(labelMs + offset, "ut1").utcMs).toISOString();
        const sky = skyAt(at, day.latitude, day.longitude);
        return body === "Sun" ? sky.sun : sky.moon;
      });
      const context = `${day.date} ${body} ${kind} ${time} UT1`;
      const [before, after] = samples;
      expect(Number.isFinite(before!.standardHorizonMarginDegrees), context).toBe(true);
      expect(Number.isFinite(after!.standardHorizonMarginDegrees), context).toBe(true);
      expect(before!.aboveStandardHorizon, context).toBe(kind === "set");
      expect(after!.aboveStandardHorizon, context).toBe(kind === "rise");
      expect(before!.standardHorizonMarginDegrees * after!.standardHorizonMarginDegrees, context)
        .toBeLessThan(0);
      checked += 1;
    }
    expect(checked).toBe(10);
  });

  it.each(references.phases.phasedata)("agrees with the primary-phase definition at January $day: $phase", (row) => {
    const date = `${row.year}-${String(row.month).padStart(2, "0")}-${String(row.day).padStart(2, "0")}`;
    const phase = skyAt(inputAtUt1(date, `${row.time}:00`), 0, 0).moonPhase;
    const definitions = {
      "New Moon": [0, 0], "First Quarter": [90, 0.5],
      "Full Moon": [180, 1], "Last Quarter": [270, 0.5]
    } as const;
    const [angle, illumination] = definitions[row.phase];
    expect(Number.isFinite(phase.elongationDegrees)).toBe(true);
    expect(Number.isFinite(phase.approximateIlluminatedFraction)).toBe(true);
    const difference = Math.abs(((phase.elongationDegrees - angle + 540) % 360) - 180);
    expect(difference).toBeLessThanOrEqual(0.05);
    expect(Math.abs(phase.approximateIlluminatedFraction - illumination)).toBeLessThanOrEqual(0.001);
    expect(phase.name).toBe(row.phase);
  });

  it.each(references.polar)("agrees with USNO polar day/night at four instants on $date", (row) => {
    const statuses = row.selectedFields["properties.data.sundata"].filter((item) => item.phen.endsWith("the Horizon"));
    expect(statuses).toHaveLength(1);
    const expected = statuses[0]!.phen === "Object continuously above the Horizon";
    expect(statuses[0]!.phen).toBe(expected
      ? "Object continuously above the Horizon" : "Object continuously below the Horizon");
    for (const time of ["00:00:00", "06:00:00", "12:00:00", "18:00:00"]) {
      const sky = skyAt(inputAtUt1(row.date, time), row.latitude, row.longitude);
      expect(Number.isFinite(sky.sun.standardHorizonMarginDegrees), time).toBe(true);
      expect(sky.sun.aboveStandardHorizon, time).toBe(expected);
      expect(sky.sun.aboveGeometricHorizon, time).toBe(expected);
    }
  });
});
