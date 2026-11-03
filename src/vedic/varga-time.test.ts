import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { chartPoints } from "../index.js";
import { timeBasis } from "../time-scale.js";
import type { TimeScaleName } from "../time-scale.js";
import type { BirthInput } from "../types.js";
import {
  AYANAMSAS,
  VARGAS,
  VARGA_POINTS,
  ayanamsa,
  siderealChart,
  siderealLongitude,
  userAyanamsa,
  vargaOf,
  vargaSensitivity
} from "../vedic.js";
import type {
  AyanamsaDefinition,
  SiderealLongitude,
  VargaName,
  VargaPoint,
  VargaScheme,
  VargaSensitivity
} from "../vedic.js";
import { WINDOW_RATE_BOUNDS } from "../window.js";
import { changeBoundaries, vargaAtTick } from "./varga.js";
import { BODY_RATE_BOUNDS, VARGA_BUDGET, kept, runOf, searchRuns, seamWalks, siderealAt } from "./varga-time.js";
import type { Run } from "./varga-time.js";

// F1 of docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/PREREGISTRATION.md (section 6),
// written by tools/varga_changes.py there from the transcribed rules of
// docs/evidence/vedic-2026-09-28/tools/boundary_fixtures.py with exact rational
// arithmetic; it never runs the engine. Each row: [T, the sign index on the tick
// below T, the sign index at T, 1 for a change and 0 for a keep].
type Row = [t: number, below: number, at: number, change: number];
interface ChangeFixture {
  keys: string[];
  total: { boundaries: number; changes: number; keeps: number };
  varga: Record<string, Row[]>;
}
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/varga-changes.json", import.meta.url), "utf8")
) as ChangeFixture;
const CIRCLE = 360 * 7560;
const keyOf = (key: string): [VargaName, VargaScheme] => [
  key.replace("cyclic", "") as VargaName,
  key.endsWith("cyclic") ? "cyclic" : "parashari"
];

/**
 * G-V2 (a)'s comparison: each part boundary of the fixture that `boundaries`
 * classes otherwise (a change left out, or a keep listed), and each of
 * `boundaries` that is not a part boundary of the fixture.
 */
function mismatches(rows: readonly Row[], boundaries: readonly number[]): string[] {
  const listed = new Set(boundaries);
  const out = rows
    .filter(([t, , , change]) => listed.has(t) !== (change === 1))
    .map(([t, , , change]) => `${t}: a ${change === 1 ? "change" : "keep"} in the fixture`);
  const parts = new Set(rows.map(([t]) => t));
  for (const t of boundaries) if (!parts.has(t)) out.push(`${t}: not a part boundary of the fixture`);
  return out;
}

describe("the varga change boundaries against F1 (G-V2 a)", () => {
  it("covers the 18 keys: 3,480 part boundaries, 3,456 changes and 24 keeps", () => {
    expect(fixture.keys).toEqual([...VARGAS.map((varga) => varga.name), "D2cyclic", "D3cyclic"]);
    expect(Object.keys(fixture.varga)).toEqual(fixture.keys);
    const rows = Object.values(fixture.varga).flat();
    expect(rows).toHaveLength(3480);
    expect(rows.filter((row) => row[3] === 1)).toHaveLength(3456);
    expect(fixture.total).toEqual({ boundaries: 3480, changes: 3456, keeps: 24 });
  });

  it.each(Object.keys(fixture.varga))("%s: the change boundaries are the fixture's change rows", (key) => {
    const boundaries = changeBoundaries(...keyOf(key));
    expect(mismatches(fixture.varga[key]!, boundaries)).toEqual([]);
    expect(Object.isFrozen(boundaries)).toBe(true);
    expect([...boundaries]).toEqual([...boundaries].sort((a, b) => a - b));
  });

  it("gives the fixture's sign on the tick below and at every part boundary", () => {
    const wrong: string[] = [];
    for (const [key, rows] of Object.entries(fixture.varga)) {
      const [varga, scheme] = keyOf(key);
      for (const [t, below, at] of rows) {
        const signs = [vargaAtTick((t - 1 + CIRCLE) % CIRCLE, varga, scheme).signIndex, vargaAtTick(t, varga, scheme).signIndex];
        if (signs[0] !== below || signs[1] !== at) wrong.push(`${key} ${t}: ${signs} for ${below},${at}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("control (i): every part boundary taken for a change is 24 mismatches, the keeps", () => {
    const found = Object.values(fixture.varga).flatMap((rows) => mismatches(rows, rows.map(([t]) => t)));
    expect(found).toHaveLength(24);
    expect(found.every((line) => line.endsWith("a keep in the fixture"))).toBe(true);
  });

  it("control (ii): one change row turned into a keep is one mismatch", () => {
    const rows = fixture.varga.D60!.map((row): Row => [...row]);
    rows[0]![3] = 0;
    expect(mismatches(rows, changeBoundaries("D60"))).toEqual([`${rows[0]![0]}: a keep in the fixture`]);
  });
});

const DAY = 86_400_000;
const T = 7560;

/**
 * The public API's sidereal longitudes for `birth` read at `ms` on its own
 * clock, after a chart a day away: siderealChart's ascendant and bodies, and
 * siderealLongitude of chartPoints' mean nodes with the chart's ayanamsaValue.
 */
function publicAt(birth: BirthInput, ayanamsa: AyanamsaDefinition, ms: number): (point: VargaPoint) => SiderealLongitude {
  const at = (when: number): BirthInput => ({ ...birth, utc: new Date(when) });
  siderealChart(at(ms - DAY), ayanamsa);
  const chart = siderealChart(at(ms), ayanamsa);
  const points = chartPoints(at(ms)).points;
  return (point) =>
    point === "Ascendant"
      ? chart.ascendant!
      : point.startsWith("Mean")
        ? siderealLongitude(points.find((row) => row.point === point)!.lon, chart.ayanamsaValue)
        : chart.bodies.find((row) => row.body === point)!;
}

/**
 * Each computed row's position and changes against the public API: the
 * position is vargaOf at the birth; each change's `from` is the sign at
 * at − 1 ms and `to` the sign at at; `minutes` is (at − birth) / 60,000, on its
 * side, inside `searched`; and `boundary` is T / 7560 for a whole T on the
 * short arc between the two longitudes, an end of the birth's run.
 */
function disagreements(result: VargaSensitivity, birth: BirthInput, ayanamsa: AyanamsaDefinition): string[] {
  const out: string[] = [];
  const t0 = Date.parse(result.utc);
  const cache = new Map<number, (point: VargaPoint) => SiderealLongitude>();
  const lon = (ms: number, point: VargaPoint) => {
    if (!cache.has(ms)) cache.set(ms, publicAt(birth, ayanamsa, ms));
    return cache.get(ms)!(point);
  };
  const [from, to] = [Date.parse(result.searched.from), Date.parse(result.searched.to)];
  for (const row of result.rows) {
    if (row.refusal) continue;
    const label = `${row.point} ${row.varga} ${row.scheme}`;
    const sign = (ms: number) => vargaOf(lon(ms, row.point), row.varga, row.scheme).sign;
    if (JSON.stringify(row.position) !== JSON.stringify(vargaOf(lon(t0, row.point), row.varga, row.scheme))) out.push(`${label}: position`);
    for (const [side, change] of [["previous", row.previous], ["next", row.next]] as const) {
      if (!change) continue;
      const at = Date.parse(change.at);
      if (change.from !== sign(at - 1) || change.to !== sign(at) || change.from === change.to) out.push(`${label} ${side}: signs`);
      if (change.minutes !== (at - t0) / 60_000 || (side === "previous" ? at > t0 : at <= t0) || at < from || at > to) {
        out.push(`${label} ${side}: instant`);
      }
      const tick = Math.round(change.boundary * T);
      const [before, after] = [lon(at - 1, row.point).lon, lon(at, row.point).lon];
      const arc = (end: number) => ((end - before + 540) % 360) - 180;
      const step = arc(after);
      const reach = arc(tick / T);
      if (change.boundary !== tick / T || !changeBoundaries(row.varga, row.scheme).includes(tick) ||
        !(step > 0 ? reach > 0 && reach <= step : reach < 0 && reach >= step)) out.push(`${label} ${side}: boundary`);
    }
  }
  return out;
}

describe("the copied rate bounds", () => {
  it("equal WINDOW_RATE_BOUNDS body by body", () => {
    const bodies = Object.keys(BODY_RATE_BOUNDS);
    expect(bodies).toEqual(VARGA_POINTS.slice(1, 11));
    expect(Object.keys(WINDOW_RATE_BOUNDS)).toEqual([...bodies, "North Node", "South Node"]);
    for (const body of bodies) {
      expect(BODY_RATE_BOUNDS[body as keyof typeof BODY_RATE_BOUNDS]).toBe(WINDOW_RATE_BOUNDS[body as keyof typeof WINDOW_RATE_BOUNDS]);
    }
    expect(Object.isFrozen(BODY_RATE_BOUNDS)).toBe(true);
  });
});

describe("the three evaluation paths (a regression test, not accuracy evidence)", () => {
  const clocks: { name: string; clock: Pick<BirthInput, "timeScale" | "deltaT"> }[] = [
    { name: "UTC", clock: {} },
    { name: "UT1", clock: { timeScale: "ut1" } },
    { name: "TT", clock: { timeScale: "tt" } },
    { name: "UTC with a pinned ΔT", clock: { deltaT: 64.25 } },
    { name: "UT1 with a pinned ΔT", clock: { timeScale: "ut1", deltaT: 31.5 } },
    { name: "TT with a pinned ΔT", clock: { timeScale: "tt", deltaT: 120 } }
  ];
  const ayanamsas: [string, AyanamsaDefinition][] = [
    ["epoch", AYANAMSAS.lahiri],
    ["linear", AYANAMSAS.raman],
    ["star", AYANAMSAS["true-chitra"]],
    ["a caller's epoch", userAyanamsa({ name: "test-epoch", epoch: { julianDateTT: 2_451_545 }, value: 23.85 })],
    ["a caller's linear", userAyanamsa({ name: "test-linear", epoch: { julianDateTT: 2_451_545 }, value: 23.85, rate: -3_600 })]
  ];
  const births = [
    { utc: "1833-08-19T13:00:00.007Z", latitude: 47.37, longitude: 8.54 },
    { utc: "1975-03-14T06:07:08.090Z", latitude: -33.87, longitude: 151.21 },
    { utc: "2131-11-02T21:43:05.321Z", latitude: 64.13, longitude: -21.9 }
  ];
  it.each(clocks)("equal siderealChart and chartPoints bit for bit on $name, alone and 1 ms after another call", ({ clock }) => {
    const wrong: string[] = [];
    for (const [kind, ayanamsa] of ayanamsas) {
      for (const place of births) {
        const birth: BirthInput = { ...place, ...clock };
        const ms = Date.parse(place.utc);
        const sky = { scale: clock.timeScale ?? "utc", pin: clock.deltaT, latitude: place.latitude, longitude: place.longitude, definition: ayanamsa };
        const expected = publicAt(birth, ayanamsa, ms);
        for (const point of VARGA_POINTS) {
          siderealAt(point, ms + DAY, sky);
          const alone = siderealAt(point, ms, sky);
          siderealAt(point, ms - 1, sky);
          const after = siderealAt(point, ms, sky);
          const lon = expected(point).lon;
          if (!Object.is(alone, lon) || !Object.is(after, lon)) wrong.push(`${kind}, ${place.utc}, ${point}: ${alone}, ${after} for ${lon}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe("the search core: analytic contract cases", () => {
  // Synthetic longitudes whose crossing milliseconds are exact by construction:
  // every value below is a binary fraction a double holds exactly.
  const run = (from: number, to: number): Run => [from * T, to * T];
  const steady = (start: number, rate: number) => (ms: number): number => (((start + ms * rate) % 360) + 360) % 360;
  const up: readonly [number, number] = [2 ** -21, 2 ** -19];

  it("steady motion up: the first millisecond on each side outside the run", () => {
    expect(searchRuns(steady(100.75, 2 ** -20), 1, up, [run(100.5, 101)], 0, -300_000, 300_000, []))
      .toEqual([[[-262_144, 100.5 * T]], [[262_144, 101 * T]]]);
  });

  it("steady motion down: a longitude on the run's first boundary is inside it", () => {
    expect(searchRuns(steady(100.75, -(2 ** -20)), -1, up, [run(100.5, 101)], 0, -300_000, 300_000, []))
      .toEqual([[[-262_143, 101 * T]], [[262_145, 100.5 * T]]]);
  });

  it("a rate-bounded point: steps shrink to a millisecond at the boundary", () => {
    expect(searchRuns(steady(100.75, 2 ** -22), 0, [0, 2 ** -20], [run(100.5, 101)], 0, -2_000_000, 2_000_000, []))
      .toEqual([[[-1_048_576, 100.5 * T]], [[1_048_576, 101 * T]]]);
  });

  it("a wrap through 0 degrees: the D1 run of Pisces ends at 0", () => {
    const pisces = runOf(changeBoundaries("D1"), 359.75 * T);
    expect(pisces).toEqual([330 * T, 0]);
    expect(searchRuns(steady(359.75, 2 ** -20), 1, up, [pisces], 0, -40_000_000, 300_000, []))
      .toEqual([[[-31_195_136, 330 * T]], [[262_144, 0]]]);
  });

  it("the D2 run from 345 to 15 degrees keeps its sign through 0", () => {
    const leo = runOf(changeBoundaries("D2"), 350 * T);
    expect(leo).toEqual([345 * T, 15 * T]);
    expect(searchRuns(steady(350, 2 ** -12), 1, [2 ** -13, 2 ** -11], [leo], 0, -200_000, 200_000, []))
      .toEqual([[[-20_480, 345 * T]], [[102_400, 15 * T]]]);
  });

  it.each([10_000, 10_001])("a station touching a boundary for one millisecond, at %i, is a change", (m) => {
    const station = (ms: number) => 101 - (ms - m) ** 2 * 2 ** -30;
    expect(searchRuns(station, 0, [0, 2 ** -14], [run(100.5, 101)], 0, -100_000, 100_000, []))
      .toEqual([[[m - 23_170, 100.5 * T]], [[m, 101 * T]]]);
  });

  it("a station stopping short of a boundary is none", () => {
    const station = (ms: number) => 101 - 2 ** -30 - (ms - 10_000) ** 2 * 2 ** -30;
    expect(searchRuns(station, 0, [0, 2 ** -14], [run(100.5, 101)], 0, -30_000, 30_000, []))
      .toEqual([[[-13_170, 100.5 * T]], [null]]);
  });

  it("a seam stepping forward across a boundary changes on the seam's first millisecond", () => {
    const stepped = (ms: number) => 100.75 + ms * 2 ** -20 + (ms >= 100_000 ? 0.25 : 0);
    expect(searchRuns(stepped, 1, up, [run(100.5, 101)], 0, -300_000, 300_000, [[98_500, 101_500]]))
      .toEqual([[[-262_144, 100.5 * T]], [[100_000, 101 * T]]]);
  });

  it("a seam stepping back after a crossing just before it: the crossing it undoes is the change", () => {
    const seam = 262_167;
    const stepped = (ms: number) => 100.75 + ms * 2 ** -20 - (ms >= seam ? 0.25 : 0);
    expect(searchRuns(stepped, 1, up, [run(100.5, 101)], 0, -400_000, 400_000, [[seam - 1_023, seam + 1_023]]))
      .toEqual([[[-262_144, 100.5 * T]], [[262_144, 101 * T]]]);
  });

  it("a bound broken on purpose is refused", () => {
    expect(searchRuns(steady(100.75, 2 ** -16), 0, [0, 2 ** -20], [run(100.5, 101)], 0, -300_000, 300_000, [])).toBe("rate-bound");
    expect(searchRuns(steady(100.75, 2 ** -16), 1, up, [run(100.5, 101)], 0, -300_000, 300_000, [])).toBe("rate-bound");
  });

  it("the budget spent is refused", () => {
    const search = (left: number) =>
      searchRuns(kept(steady(100.75, 2 ** -20), { left }), 1, up, [run(100.5, 101)], 0, -300_000, 300_000, []);
    expect(search(5)).toBe("evaluation-budget");
    expect(search(1_000)).toEqual([[[-262_144, 100.5 * T]], [[262_144, 101 * T]]]);
    expect(VARGA_BUDGET).toBe(2_000_000);
  });
});

describe("the seams of the time basis", () => {
  // Each seam of the preregistration's table on each clock on which it steps. The
  // steps are found here a millisecond at a time, from UT1 and TT alone.
  const cases: [TimeScaleName, number | undefined, string][] = [
    ["utc", undefined, "2017-01-01T00:00:00Z"],
    ["utc", 60, "2017-01-01T00:00:00Z"],
    ["utc", undefined, "1972-01-01T00:00:00Z"],
    ["utc", 60, "1972-01-01T00:00:00Z"],
    ["ut1", undefined, "1972-01-01T00:00:00Z"],
    ["tt", undefined, "1972-01-01T00:00:42Z"],
    ["utc", undefined, "2027-10-02T00:00:00Z"],
    ["utc", 60, "2027-10-02T00:00:00Z"],
    ["ut1", undefined, "2027-10-02T00:00:00Z"],
    ["tt", undefined, "2027-10-02T00:01:09Z"],
    ["utc", undefined, "1940-12-31T18:00:00Z"],
    ["ut1", undefined, "1940-12-31T18:00:00Z"],
    ["tt", undefined, "1940-12-31T18:00:25Z"]
  ];
  it.each(cases)("on %s, ΔT pinned to %s, near %s: a walk holds each step with a second either side", (scale, pin, near) => {
    const nominal = Date.parse(near);
    const steps: number[] = [];
    let before = timeBasis(nominal - 3_001, scale, pin);
    for (let ms = nominal - 3_000; ms <= nominal + 3_000; ms += 1) {
      const at = timeBasis(ms, scale, pin);
      if (Math.abs((at.ut1Days - before.ut1Days) * DAY - 1) > 0.01 || Math.abs((at.ttDays - before.ttDays) * DAY - 1) > 0.01) {
        steps.push(ms);
      }
      before = at;
    }
    expect(steps.length).toBeGreaterThan(0);
    const walks = seamWalks(nominal - 7_200_000, nominal + 7_200_000, scale, pin);
    for (const z of steps) expect(walks.some(([u, v]) => u <= z - 1_000 && z + 1_000 <= v)).toBe(true);
  });

  it("gives changes the public API bears out across one (the leap second before 2017, on UTC)", () => {
    const birth: BirthInput = { utc: "2016-12-31T23:59:40Z", latitude: 41.9, longitude: 12.5 };
    const result = vargaSensitivity(birth, "krishnamurti", { points: ["Ascendant", "Moon"], cyclic: true, horizonMinutes: 20 });
    expect(result.rows.every((row) => row.refusal === null)).toBe(true);
    expect(disagreements(result, birth, AYANAMSAS.krishnamurti)).toEqual([]);
  });
});

describe("refusals", () => {
  const birth = { utc: "1990-05-17T08:30:00Z", latitude: 12.97, longitude: 77.59 }; // synthetic (docs/vedic.md)
  const reasons = (result: VargaSensitivity) => [...new Set(result.rows.map((row) => `${row.point}: ${row.refusal?.reason ?? "computed"}`))];
  const small = { points: ["Ascendant", "Sun"], vargas: ["D1", "D9"] } as const;

  it("refuses the Ascendant's rows with no-angles without a known time, and computes the bodies around the instant", () => {
    const result = vargaSensitivity({ ...birth, timeKnown: false }, "lahiri", small);
    expect(reasons(result)).toEqual(["Ascendant: no-angles", "Sun: computed"]);
    const row = result.rows[0]!;
    expect([row.position, row.previous, row.next, row.refusal?.status]).toEqual([null, null, null, "refused"]);
    expect(result.flags).toEqual(["no-time"]);
    expect(result.evaluations.Ascendant).toBe(0);
    expect(result.evaluations.Sun).toBeGreaterThan(0);
  });

  it("refuses them with no-angles without a place", () => {
    expect(reasons(vargaSensitivity({ utc: birth.utc }, "lahiri", small))).toEqual(["Ascendant: no-angles", "Sun: computed"]);
  });

  it("computes the Ascendant at 66 degrees and refuses it with polar beyond, in either hemisphere", () => {
    for (const latitude of [66, -66]) {
      expect(reasons(vargaSensitivity({ ...birth, latitude }, "lahiri", small))).toEqual(["Ascendant: computed", "Sun: computed"]);
    }
    for (const latitude of [66.000001, -66.000001]) {
      expect(reasons(vargaSensitivity({ ...birth, latitude }, "lahiri", small))).toEqual(["Ascendant: polar", "Sun: computed"]);
    }
  });

  it.each([
    { utc: "1799-12-31T23:59:59.999Z" },
    { utc: "2200-01-01T00:00:00Z" },
    { utc: "2199-12-31T23:30:00Z", deltaT: 3_600 }
  ])("refuses every row with out-of-range when the birth's UT1 or TT is outside REFERENCE_SPAN: $utc", (instant) => {
    const result = vargaSensitivity({ ...birth, ...instant }, "lahiri", small);
    expect(reasons(result)).toEqual(["Ascendant: out-of-range", "Sun: out-of-range"]);
    expect(result.rows.every((row) => row.position === null && row.previous === null && row.next === null)).toBe(true);
    expect(result.searched).toEqual({ from: result.utc, to: result.utc });
  });

  it("cuts the horizon where an instant's UT1 or TT would leave REFERENCE_SPAN", () => {
    const options = { points: ["Mean Node"], vargas: ["D60"] } as const;
    const early = vargaSensitivity({ ...birth, utc: "1800-01-01T06:00:00Z" }, "lahiri", options);
    expect(early.searched).toEqual({ from: "1800-01-01T00:00:00.000Z", to: "1800-01-02T06:00:00.000Z" });
    const late = vargaSensitivity({ ...birth, utc: "2199-12-31T12:00:00Z" }, "lahiri", options);
    const end = Date.parse(late.searched.to);
    const tt = (ms: number) => Date.UTC(2000, 0, 1, 12) + timeBasis(ms, "utc").ttDays * DAY;
    expect(late.searched.from).toBe("2199-12-30T12:00:00.000Z");
    expect([tt(end) < Date.UTC(2200, 0, 1), tt(end + 1) >= Date.UTC(2200, 0, 1)]).toEqual([true, true]);
  });

  it("accepts horizons of 1 and 2,880 minutes", () => {
    for (const horizonMinutes of [1, 2_880]) {
      const result = vargaSensitivity(birth, "lahiri", { points: ["Mean Node"], vargas: ["D60"], horizonMinutes });
      expect(Date.parse(result.searched.to) - Date.parse(result.searched.from)).toBe(2 * horizonMinutes * 60_000);
    }
  });

  it.each([
    ["an option key not named", { horizon: 60 }],
    ["the true node, which is not offered", { points: ["North Node"] }],
    ["a repeated point", { points: ["Sun", "Sun"] }],
    ["points not in an array", { points: "Sun" }],
    ["a varga outside the sixteen", { vargas: ["D5"] }],
    ["a repeated varga", { vargas: ["D9", "D9"] }],
    ["cyclic not a boolean", { cyclic: "yes" }],
    ["a horizon of 0 minutes", { horizonMinutes: 0 }],
    ["a horizon of 2,881 minutes", { horizonMinutes: 2_881 }],
    ["a horizon in part minutes", { horizonMinutes: 1.5 }],
    ["a horizon as a string", { horizonMinutes: "60" }],
    ["options that are not an object", "D9"]
  ])("throws RangeError for %s", (_, options) => {
    expect(() => vargaSensitivity(birth, "lahiri", options as never)).toThrow(RangeError);
  });

  it("throws RangeError for an unknown ayanamsa and for what siderealChart refuses", () => {
    expect(() => vargaSensitivity(birth, "lahri" as never)).toThrow(RangeError);
    expect(() => vargaSensitivity({ ...birth, utc: "not a date" }, "lahiri")).toThrow(RangeError);
    expect(() => vargaSensitivity({ ...birth, latitude: 91 }, "lahiri")).toThrow(RangeError);
  });
});

describe("the docs' synthetic birth (docs/vedic.md), a regression example", () => {
  const birth: BirthInput = { utc: "1990-05-17T08:30:00Z", latitude: 12.97, longitude: 77.59 }; // synthetic
  let computed: VargaSensitivity | undefined;
  const call = () => (computed ??= vargaSensitivity(birth, "lahiri"));
  const sides = (point: VargaPoint, varga: VargaName) => {
    const row = call().rows.find((each) => each.point === point && each.varga === varga)!;
    return [row.position?.sign, row.previous, row.next];
  };

  it("pins the engine's own instants of the Ascendant's D1, D9 and D60 and the Moon's D9", () => {
    expect(sides("Ascendant", "D1")).toEqual([
      "leo",
      { at: "1990-05-17T06:42:11.962Z", minutes: -107.80063333333334, boundary: 120, from: "cancer", to: "leo" },
      { at: "1990-05-17T08:45:07.575Z", minutes: 15.12625, boundary: 150, from: "leo", to: "virgo" }
    ]);
    expect(sides("Ascendant", "D9")).toEqual([
      "scorpio",
      { at: "1990-05-17T08:18:11.829Z", minutes: -11.80285, boundary: 143.33333333333334, from: "libra", to: "scorpio" },
      { at: "1990-05-17T08:31:40.631Z", minutes: 1.6771833333333332, boundary: 146.66666666666666, from: "scorpio", to: "sagittarius" }
    ]);
    expect(sides("Ascendant", "D60")).toEqual([
      "sagittarius",
      { at: "1990-05-17T08:28:59.039Z", minutes: -1.0160166666666666, boundary: 146, from: "scorpio", to: "sagittarius" },
      { at: "1990-05-17T08:31:00.240Z", minutes: 1.004, boundary: 146.5, from: "sagittarius", to: "capricorn" }
    ]);
    expect(sides("Moon", "D9")).toEqual([
      "virgo",
      { at: "1990-05-17T08:13:06.504Z", minutes: -16.8916, boundary: 296.6666666666667, from: "leo", to: "virgo" },
      { at: "1990-05-17T14:23:43.028Z", minutes: 353.7171333333333, boundary: 300, from: "virgo", to: "libra" }
    ]);
  });

  it("gives the ten default points' rows in order, sixteen each, frozen", () => {
    const result = call();
    expect(result.rows).toHaveLength(160);
    expect([...new Set(result.rows.map((row) => row.point))]).toEqual(VARGA_POINTS.filter((_, k) => k < 8 || k > 10));
    expect(result.rows.slice(0, 16).map((row) => row.varga)).toEqual(VARGAS.map((varga) => varga.name));
    expect(result.rows.map((row) => row.completeness === "derived")).toEqual(
      result.rows.map((row) => row.point === "Ascendant" || row.point.startsWith("Mean"))
    );
    expect([result.ayanamsa, result.utc, result.horizonMinutes, result.flags]).toEqual(["lahiri", "1990-05-17T08:30:00.000Z", 1_440, []]);
    expect(result.searched).toEqual({ from: "1990-05-16T08:30:00.000Z", to: "1990-05-18T08:30:00.000Z" });
    const counts = Object.entries(result.evaluations);
    expect(counts.map(([point]) => point)).toEqual([...new Set(result.rows.map((row) => row.point))]);
    expect(counts.every(([, count]) => count! > 0)).toBe(true);
    expect(counts.reduce((sum, [, count]) => sum + count!, 0)).toBeLessThanOrEqual(VARGA_BUDGET);
    const frozen = [result, result.rows, result.searched, result.evaluations, VARGA_POINTS, ...result.rows,
      ...result.rows.flatMap((row) => [row.previous, row.next].filter((change) => change !== null))];
    expect(frozen.every((value) => Object.isFrozen(value))).toBe(true);
  });

  it("is borne out by the public API, row by row", () => {
    expect(disagreements(call(), birth, AYANAMSAS.lahiri)).toEqual([]);
  });
});

describe("a star definition near the Sun", () => {
  it("moves faster than 0.0003° a day there, within the bound the search takes, and leaves the mean nodes computed", () => {
    // True Pushya's star, δ Cnc, passes behind the Sun's disc on 2000-07-31, where
    // the light deflection moves its place fastest: its true ayanamsa every minute.
    let fastest = 0;
    for (let ms = Date.UTC(2000, 6, 30, 12); ms < Date.UTC(2000, 7, 1, 12); ms += 60_000) {
      const step = ayanamsa("true-pushya", new Date(ms + 30_000)).true - ayanamsa("true-pushya", new Date(ms - 30_000)).true;
      fastest = Math.max(fastest, Math.abs(step) * 1_440);
    }
    expect(fastest).toBeGreaterThan(0.0003);
    expect(fastest).toBeLessThan(0.0003 + 0.021);
    const result = vargaSensitivity({ utc: "2000-07-31T12:00:00Z", latitude: 10, longitude: 0 }, "true-pushya", {
      points: ["Mean Node", "Mean South Node"],
      vargas: ["D60"]
    });
    expect(result.rows.map((row) => row.refusal)).toEqual([null, null]);
  });
});
