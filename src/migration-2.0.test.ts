import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { instantsBetween, TABLE_END } from "../scripts/continuous-utc-instants.mjs";
import { chart, houses } from "./calc.js";
import * as core from "./core.js";
import {
  dateOfJulianDayNumber, julianDayNumber, localMeanTimeOffset,
  prepareLocalTime, resolveLocalBirth, resolveLocalToUtc, TZDB, zoneOffsetAt
} from "./geo.js";
import { setHostForTests } from "./geo/timezone.js";
import * as root from "./index.js";
import type { Chart, ChartFlag, InstantFlag, TimeScale } from "./index.js";
import { createNatalEnvelope, natalReplayInput, parseNatalEnvelope, serializeNatalEnvelope } from "./receipt.js";
import { solarArc } from "./timing.js";

const { natalChart, positions, progressedBodies, progressedInstant, saturnReturn, transits } = root;
const date = "1990-05-03";
const midnight = "1990-05-03T00:00:00Z";
const utc = "1990-05-03T12:00:00Z";
const place = { latitude: 40, longitude: -74 };
const future = "2030-01-01T00:00:00Z";
const target = "2024-02-29T00:00:00Z";

const nearMisses = [
  ["lat", "latitude"],
  ["lng", "longitude"],
  ["lon", "longitude"],
  ["long", "longitude"],
  ["house", "houseSystem"],
  ["houses", "houseSystem"],
  ["hsys", "houseSystem"],
  ["housesystem", "houseSystem"],
  ["scale", "timeScale"],
  ["time_scale", "timeScale"],
  ["delta_t", "deltaT"],
  ["time_known", "timeKnown"],
  ["unknownTime", "timeKnown"]
] as const;

const casesByName = nearMisses.map(([name, field]) => {
  const lower = name.toLowerCase();
  return {
    name,
    field,
    spellings: [lower, lower.toUpperCase(), lower[0]!.toUpperCase() + lower.slice(1), name]
  };
});

function ttMinusUtc({ deltaT, timeScale }: Chart): number {
  // TT - UTC = (TT - UT1) + (UT1 - UTC), using the chart's offsets in
  // seconds to avoid the precision loss of subtracting two Julian dates.
  expect(timeScale.ut1MinusUtc?.source).toBe("model");
  return deltaT.seconds + timeScale.ut1MinusUtc!.seconds;
}

// Compile only, like src/fixtures/near-miss.typecheck.ts. This lives in the
// migration test file so the compile-time check uses the same allowed path.
function oldExhaustiveChartFlag(flag: ChartFlag): string {
  switch (flag) {
    case "dst-gap":
    case "dst-fold":
    case "lmt":
    case "no-time":
    case "polar-fallback":
    case "outside-reference-span":
    case "delta-t-extrapolated":
    case "de440-unavailable":
    case "outside-de440-span":
      return flag;
    default: {
      // @ts-expect-error The 1.1.0 cases leave the three new ChartFlag values.
      const missing: never = flag;
      return missing;
    }
  }
}
void oldExhaustiveChartFlag;

function chartFlagMessage(flag: ChartFlag): string {
  switch (flag) {
    case "polar-angles": return "Angles inside the polar circle";
    case "calendar-unknown": return "Civil calendar uncertain";
    case "host-zone-data-differs": return "Host time zone data differs";
    default: return flag;
  }
}

function timeLabels(time: TimeScale): [string, string | undefined] {
  return [
    time.basis === "continuous-utc" ? "Continuous UTC" : time.basis,
    time.ut1MinusUtc?.source === "model" ? "Modelled UT1" : time.ut1MinusUtc?.source
  ];
}

describe("Migrating from 1.1.0 to 2.0.0", () => {
  beforeAll(() => root.setDefaultEphemeris("de440"));

  it('A bare birth date throws a RangeError unless timeKnown is false.', () => {
    const bare = { utc: date };
    for (const call of [
      () => natalChart(bare),
      () => transits(bare, target),
      () => root.synastry(bare, { utc }),
      () => root.chartPoints({ ...bare, ...place }),
      () => root.chartDeclinations(bare),
      () => saturnReturn(date),
      () => saturnReturn(bare),
      () => chart({ time: date }),
      () => chart({ time: { iso: date } })
    ]) {
      expect(call).toThrow(RangeError);
    }

    const untimed = natalChart({ ...bare, ...place, timeKnown: false });
    expect(untimed.input.utc.toISOString()).toBe("1990-05-03T00:00:00.000Z");
    expect(untimed.input.timeKnown).toBe(false);
    expect(untimed.flags).toContain("no-time");
    expect(untimed.angles).toBeNull();
    expect(untimed.houses).toBeNull();
    expect(chart({ time: date, timeKnown: false })).toMatchObject({ status: "ok", chart: { flags: ["no-time"] } });

    const explicit = natalChart({ utc: midnight, ...place });
    expect(explicit.input.timeKnown).toBe(true);
    expect(explicit.angles).not.toBeNull();
    for (const instant of [new Date(midnight), Date.parse(midnight), "1990-05-03T02:00:00+02:00"]) {
      expect(natalChart({ utc: instant, ...place })).toEqual(explicit);
    }
  });

  it.each(casesByName)("The listed near-miss birth keys throw a RangeError in any letter case. ($name)", ({ field, spellings }) => {
    for (const key of new Set(spellings)) {
      const birth = { utc, [key]: 1 };
      const calculate = () => natalChart(birth);
      expect(calculate, key).toThrow(RangeError);
      expect(calculate, key).toThrow(field);
    }
  });

  it("The error names the field to use, and other unknown keys are ignored.", () => {
    const nearMiss = { utc, lat: 40, lng: -74 };
    expect(() => natalChart(nearMiss)).toThrow(RangeError);
    expect(() => natalChart(nearMiss)).toThrow("latitude");
    const extra = { utc, ...place, foo: 1 };
    const fixed = natalChart({ utc, ...place });
    expect(fixed.angles).not.toBeNull();
    expect(natalChart(extra)).toEqual(fixed);
  });

  it("After the IERS table, unpinned UTC input puts TT exactly 69.184 seconds ahead of UTC.", () => {
    const at = natalChart({ utc: future });
    expect(at.timeScale.basis).toBe("continuous-utc");
    expect(ttMinusUtc(at)).toBe(69.184);
    expect(at.flags).toContain("delta-t-extrapolated");

    const justBefore = natalChart({ utc: TABLE_END - 1 });
    const last = natalChart({ utc: TABLE_END });
    expect(last.input.utc.toISOString()).toBe("2027-10-02T00:00:00.000Z");
    expect(justBefore.timeScale.basis).toBe("iers");
    expect(last.timeScale.basis).toBe("iers");
    const stillPredicted = natalChart({ utc: TABLE_END + 146 });
    expect(stillPredicted.timeScale.basis).toBe("continuous-utc");
    expect(stillPredicted.deltaT.segment).toBe("predicted");
    expect(stillPredicted.flags).not.toContain("delta-t-extrapolated");
    const extrapolated = natalChart({ utc: TABLE_END + 147 });
    expect(extrapolated.deltaT.segment).toBe("extrapolated");
    expect(extrapolated.flags).toContain("delta-t-extrapolated");

    const start = Date.parse("2027-10-03T00:00:00Z");
    const end = Date.parse("2199-12-31T23:59:59.999Z");
    for (const instant of instantsBetween(338, 200, start, end)) {
      const sampled = natalChart({ utc: instant });
      expect(sampled.timeScale.basis).toBe("continuous-utc");
      expect(Math.abs(ttMinusUtc(sampled) - 69.184)).toBeLessThanOrEqual(1e-9);
    }
  });

  it("Europe/Dublin reads +0:00 from 1925-09-20T02:00Z up to 1925-10-04T02:00Z where 1.1.0 read +1:00.", async () => {
    const zone = "Europe/Dublin";
    const start = Date.parse("1925-09-20T02:00Z");
    const end = Date.parse("1925-10-04T02:00Z");
    await prepareLocalTime("1925-09-20", zone);
    expect(TZDB.version).toBe("2026f");
    expect([start - 1, start, end - 1, end].map((instant) => zoneOffsetAt(zone, instant))).toEqual([60, 0, 0, 0]);

    const local = resolveLocalToUtc("1925-09-21", "12:00", zone);
    expect(local.offsetMinutes).toBe(0);
    expect(local.utc.toISOString()).toBe("1925-09-21T12:00:00.000Z");
  });

  it("ChartFlag gains polar-angles, calendar-unknown and host-zone-data-differs.", async () => {
    const polar = natalChart({ utc, latitude: 70, longitude: 0 });
    expect(polar.flags.map(chartFlagMessage)).toContain("Angles inside the polar circle");
    expect(() => transits(polar, target)).not.toThrow();

    await prepareLocalTime("1582-10-10", "Europe/Rome");
    const calendar = resolveLocalBirth({ date: "1582-10-10", time: "12:00", timeZone: "Europe/Rome" });
    expect(calendar.resolution.flags).toContain("calendar-unknown");
    expect(natalChart(calendar.birth).flags.map(chartFlagMessage)).toContain("Civil calendar uncertain");

    // Emulate the older Havana offset from the committed host-zone probe evidence.
    setHostForTests({ offsetAt: () => -300, tzdbVersion: () => null });
    try {
      const host = resolveLocalBirth({ date: "2026-12-15", time: "12:00", timeZone: "America/Havana" });
      expect(host.resolution.flags).toContain("host-zone-data-differs");
      expect(host.resolution.zone.hostCheck).toMatchObject({
        status: "differs", hostOffsetMinutes: -300, tzdbOffsetMinutes: -240
      });
      expect(host.resolution.utc.toISOString()).toBe("2026-12-15T17:00:00.000Z");
      expect(natalChart(host.birth).flags.map(chartFlagMessage)).toContain("Host time zone data differs");
    } finally {
      setHostForTests(null);
    }
  });

  it("Rows from positions(), transits().positions and progressedBodies() can carry an optional flags field.", () => {
    const flagged: InstantFlag[] = ["delta-t-extrapolated"];
    const birth = natalChart({ utc: future });
    for (const rows of [positions(future), transits({ utc }, future).positions, progressedBodies(future, future)]) {
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.flags).toEqual(flagged);
    }
    expect(birth.flags).toEqual(flagged);

    for (const rows of [positions(utc), transits({ utc }, target).positions, progressedBodies(date, target)]) {
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect("flags" in row).toBe(false);
    }
  });

  it("A continuous-UTC natal record is refused by 1.1.0 as unsupported_feature.", async () => {
    const envelope = createNatalEnvelope(natalChart({ utc: future }));
    const record = serializeNatalEnvelope(envelope);
    expect(envelope.requiredFeatures).toContain("time-basis-continuous-utc");
    expect(parseNatalEnvelope(record).ok).toBe(true);

    const archive = new URL("../artifacts/zodiacs-engine-1.1.0.tgz", import.meta.url);
    const receipt = readFileSync(new URL("../artifacts/zodiacs-engine-1.1.0.sha256", import.meta.url), "utf8");
    expect(createHash("sha256").update(readFileSync(archive)).digest("hex")).toBe(receipt.split(/\s+/u)[0]);

    const scratch = mkdtempSync(join(tmpdir(), "migration-receipt-"));
    try {
      execFileSync("tar", ["-xzf", fileURLToPath(archive), "-C", scratch], { stdio: "ignore" });
      mkdirSync(join(scratch, "node_modules"));
      symlinkSync(
        fileURLToPath(new URL("../node_modules/astronomy-engine", import.meta.url)),
        join(scratch, "node_modules", "astronomy-engine"),
        "dir"
      );
      const earlier: Pick<typeof import("./receipt.js"), "parseNatalEnvelope"> =
        await import(pathToFileURL(join(scratch, "package/dist/receipt.js")).href);
      expect(earlier.parseNatalEnvelope(record)).toMatchObject({ ok: false, code: "unsupported_feature" });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("TimeScale.basis gains continuous-utc and Ut1MinusUtc.source gains model.", () => {
    const { timeScale } = natalChart({ utc: future });
    expect(timeLabels(timeScale)).toEqual(["Continuous UTC", "Modelled UT1"]);
    expect(timeLabels(natalChart({ utc: TABLE_END }).timeScale)).toEqual(["iers", "predicted"]);
  });

  it("The core entry exposes the root API and geo adds Julian Day Number conversion and a local mean time offset.", () => {
    // The bundled entry's astronomy-engine default and isolation are checked
    // by scripts/core-entry.test.mjs. This holds its source export surface.
    expect(Object.keys(core).sort()).toEqual(Object.keys(root).sort());
    const day = { year: 1990, month: 5, day: 3 };
    for (const calendar of ["gregorian", "julian"] as const) {
      expect(dateOfJulianDayNumber(julianDayNumber(day, calendar), calendar)).toEqual(day);
    }
    expect(localMeanTimeOffset(place.longitude)).toBe(-17_760);
  });

  it("Already-built charts, receipt replay and the non-birth date inputs below keep working.", () => {
    const built = natalChart({ utc: midnight, ...place });
    expect(transits(built, target)).toEqual(transits({ utc: midnight, ...place }, target));

    const stored = readFileSync(new URL("./fixtures/receipt-1.1.0-after-table.json", import.meta.url), "utf8");
    const decoded = parseNatalEnvelope(stored);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const input = natalReplayInput(decoded.envelope);
    expect(input.timeScale).toBe("ut1");
    const replay = natalChart(input);
    expect(replay.angles).toEqual(decoded.envelope.result.angles);
    expect(replay.houses?.cusps).toEqual(decoded.envelope.result.houses?.cusps);

    expect(progressedInstant(date, target)).toEqual(progressedInstant(midnight, target));
    expect(progressedBodies(date, target)).toEqual(progressedBodies(midnight, target));
    expect(solarArc(date, target)).toEqual(solarArc(midnight, target));
    expect(houses({ time: date, place })).toMatchObject({ status: "ok" });
    const local = resolveLocalBirth({ date, timeZone: "Etc/UTC" });
    expect(local.reference).toBe("local-noon");
    expect(local.birth.timeKnown).toBe(false);
    expect(local.resolution.utc.toISOString()).toBe("1990-05-03T12:00:00.000Z");
  });
});
