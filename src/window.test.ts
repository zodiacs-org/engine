/**
 * Birth-time window partitions against natalChart itself: every cell must
 * hold natalChart's features at every whole second it contains, and every
 * switch must be the millisecond at which natalChart's features change as it
 * says. Inputs are synthetic places and instants.
 */
import { MakeTime, SetDeltaTFunction, SiderealTime, e_tilt } from "astronomy-engine";
import { describe, expect, it } from "vitest";

import { chartDeclinations, natalChart } from "./api.js";
import { DELTA_T_TABLE, deltaT } from "./deltat.js";
import { bodyLongitude } from "./ephemeris.js";
import { houseOf } from "./houses.js";
import { findLongitudeCrossings } from "./returns.js";
import { signForLongitude } from "./signs.js";
import type { HouseSystem } from "./types.js";
import { MAX_WINDOW_MS, WINDOW_RATE_BOUNDS, WINDOW_VERIFICATION, WindowBudgetError, birthWindow } from "./window.js";
import type { BirthWindow, BirthWindowCell } from "./window.js";

const DAY = 86_400_000;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const PHYSICAL = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

interface Place {
  latitude: number;
  longitude: number;
  houseSystem: HouseSystem;
}

type Features = Record<string, string | number | null>;

/**
 * natalChart's features at an instant. astronomy-engine reuses its nutation
 * within 86.4 ms, so an instant close to the one before is preceded by an
 * evaluation a day away: each value is then what a lone call computes.
 */
let lastProbe = Number.NaN;
function chartFeatures(time: number, place: Place): Features {
  if (!(Math.abs(time - lastProbe) > 100)) natalChart({ utc: new Date(time + DAY) });
  lastProbe = time;
  const chart = natalChart({ utc: new Date(time), ...place });
  const features: Features = {};
  for (const body of chart.bodies) {
    features[`sign:${body.body}`] = body.sign;
    features[`house:${body.body}`] = houseOf(body.lon, chart.houses!.cusps);
  }
  features.ascendant = signForLongitude(chart.angles!.asc).slug;
  features.midheaven = signForLongitude(chart.angles!.mc).slug;
  const aspects = new Map(chart.aspects.map((aspect) => [`${aspect.a}|${aspect.b}`, aspect.type]));
  for (let i = 0; i < PHYSICAL.length; i += 1) {
    for (let j = i + 1; j < PHYSICAL.length; j += 1) {
      features[`aspect:${PHYSICAL[i]}|${PHYSICAL[j]}`] = aspects.get(`${PHYSICAL[i]}|${PHYSICAL[j]}`) ?? null;
    }
  }
  features["house-system"] = chart.houses!.system;
  return features;
}

function cellFeatures(cell: BirthWindowCell): Features {
  const features: Features = {};
  for (const [body, sign] of Object.entries(cell.features.signs)) features[`sign:${body}`] = sign;
  for (const [body, house] of Object.entries(cell.features.houses)) features[`house:${body}`] = house;
  features.ascendant = cell.features.ascendant;
  features.midheaven = cell.features.midheaven;
  const aspects = new Map(cell.features.aspects.map((aspect) => [`${aspect.a}|${aspect.b}`, aspect.type]));
  for (let i = 0; i < PHYSICAL.length; i += 1) {
    for (let j = i + 1; j < PHYSICAL.length; j += 1) {
      features[`aspect:${PHYSICAL[i]}|${PHYSICAL[j]}`] = aspects.get(`${PHYSICAL[i]}|${PHYSICAL[j]}`) ?? null;
    }
  }
  features["house-system"] = cell.features.houseSystem;
  return features;
}

function componentOf(change: BirthWindow["switches"][number]["changes"][number]): string {
  if (change.feature === "sign" || change.feature === "house") return `${change.feature}:${change.body}`;
  if (change.feature === "aspect") return `aspect:${change.a}|${change.b}`;
  return change.feature;
}

function cellAt(window: BirthWindow, time: number): BirthWindowCell {
  const cell = window.cells.find((candidate) => candidate.start.getTime() <= time && time < candidate.end.getTime());
  if (!cell) throw new Error(`no cell holds ${new Date(time).toISOString()}`);
  return cell;
}

/** Disagreements between the partition and natalChart at every whole second from the start, and at end − 1 ms. */
function disagreementsEverySecond(window: BirthWindow, place: Place, step = 1000): string[] {
  const start = window.start.getTime();
  const end = window.end.getTime();
  const times: number[] = [];
  for (let time = start; time < end; time += step) times.push(time);
  if (times.at(-1) !== end - 1) times.push(end - 1);
  const found: string[] = [];
  for (const time of times) {
    const expected = chartFeatures(time, place);
    const actual = cellFeatures(cellAt(window, time));
    for (const key of Object.keys(expected)) {
      if (expected[key] !== actual[key]) found.push(`${new Date(time).toISOString()} ${key}: ${String(expected[key])} ≠ ${String(actual[key])}`);
    }
  }
  return found;
}

/** Switches whose millisecond natalChart does not confirm: exactly the listed changes, from and to. */
function unconfirmedSwitches(window: BirthWindow, place: Place): string[] {
  const found: string[] = [];
  for (const entry of window.switches) {
    const at = entry.at.getTime();
    const before = chartFeatures(at - 1, place);
    const after = chartFeatures(at, place);
    const listed = new Map(entry.changes.map((change) => [componentOf(change), change]));
    for (const key of Object.keys(before)) {
      const change = listed.get(key);
      const ok = change ? before[key] === change.from && after[key] === change.to : before[key] === after[key];
      if (!ok) found.push(`${entry.at.toISOString()} ${key}: ${String(before[key])} → ${String(after[key])}`);
    }
  }
  return found;
}

function partition(start: number, milliseconds: number, place: Place): BirthWindow {
  return birthWindow({ start: new Date(start), end: new Date(start + milliseconds), ...place });
}

function expectExact(window: BirthWindow, place: Place, step = 1000): void {
  expect(window.flags).not.toContain("bound-exceeded");
  expect(disagreementsEverySecond(window, place, step)).toEqual([]);
  expect(unconfirmedSwitches(window, place)).toEqual([]);
}

describe("birthWindow against natalChart", () => {
  const cases: [string, number, number, Place][] = [
    ["mid-latitude Placidus", Date.UTC(1990, 5, 15, 12, 20, 0, 250), 600_000, { latitude: 51.5, longitude: -0.12, houseSystem: "placidus" }],
    ["Koch just inside the polar circle", Date.UTC(2044, 11, 21, 3, 0, 0), 600_000, { latitude: 66.4, longitude: 18.9, houseSystem: "koch" }],
    ["Regiomontanus in the south polar region", Date.UTC(1911, 1, 2, 7, 30, 11), 600_000, { latitude: -67.5, longitude: 140, houseSystem: "regiomontanus" }],
    ["Porphyry at 78°", Date.UTC(1850, 3, 3, 8, 0, 0), 600_000, { latitude: 78.2, longitude: 15.6, houseSystem: "porphyry" }],
    ["Alcabitius near the pole", Date.UTC(2150, 8, 1, 18, 0, 0), 600_000, { latitude: 89.99, longitude: -30, houseSystem: "alcabitius" }],
    ["Campanus near the pole", Date.UTC(1977, 2, 21, 5, 0, 0), 600_000, { latitude: 88, longitude: 5, houseSystem: "campanus" }],
    ["Topocentric at 69°", Date.UTC(2003, 9, 9, 22, 0, 0), 600_000, { latitude: -69, longitude: 60, houseSystem: "topocentric" }],
    ["Meridian on the equator", Date.UTC(2077, 0, 1, 0, 0, 0), 300_000, { latitude: 0, longitude: 100, houseSystem: "meridian" }],
    ["Morinus", Date.UTC(1820, 6, 4, 16, 0, 0), 300_000, { latitude: 35, longitude: -90, houseSystem: "morinus" }]
  ];
  for (const [label, start, milliseconds, place] of cases) {
    it(`${label}: every cell and switch`, () => {
      expectExact(partition(start, milliseconds, place), place);
    }, 120_000);
  }

  it("a whole day in six systems, at five-minute samples and every switch", () => {
    const start = Date.UTC(2031, 6, 9, 5, 17, 23, 441);
    for (const houseSystem of ["whole", "equal", "vehlow", "equal-mc", "porphyry", "placidus"] as const) {
      const place = { latitude: 48.85, longitude: 2.35, houseSystem };
      const window = partition(start, DAY, place);
      expect(window.switches.length).toBeGreaterThan(20);
      expectExact(window, place, 300_000);
    }
  }, 300_000);
});

describe("switches at the edges of the window", () => {
  const place: Place = { latitude: 40, longitude: -74, houseSystem: "whole" };
  const wide = partition(Date.UTC(2031, 6, 9, 12, 0, 0), 4 * 3_600_000, place);
  const first = wide.switches.find((entry) => entry.changes.some((change) => change.feature === "ascendant"))!;
  const at = first.at.getTime();

  it("finds an ascendant switch to begin with", () => {
    expect(first).toBeDefined();
    expect(unconfirmedSwitches(wide, place)).toEqual([]);
  });

  it("a switch at the first instant belongs to no switch list: the window opens in its cell", () => {
    const window = partition(at, 60_000, place);
    expect(window.switches.some((entry) => entry.at.getTime() === at)).toBe(false);
    expect(window.cells[0]!.start.getTime()).toBe(at);
    expect(cellFeatures(window.cells[0]!)).toEqual(cellFeatures(cellAt(wide, at)));
  });

  it("a switch at the end instant is outside [start, end)", () => {
    const window = partition(at - 60_000, 60_000, place);
    expect(window.switches.some((entry) => entry.at.getTime() === at)).toBe(false);
    expect(window.cells.at(-1)!.end.getTime()).toBe(at);
    expect(cellFeatures(window.cells.at(-1)!)).toEqual(cellFeatures(cellAt(wide, at - 1)));
  });

  it("a switch at the last millisecond opens a one-millisecond cell", () => {
    const window = partition(at - 60_000, 60_001, place);
    const last = window.switches.at(-1)!;
    expect(last.at.getTime()).toBe(at);
    expect(last.changes).toEqual(first.changes);
    expect(window.cells.at(-1)!.milliseconds).toBe(1);
    expect(window.cells.at(-1)!.share).toBe(1 / 60_001);
  });

  it("a switch one millisecond after the start closes a one-millisecond cell", () => {
    const window = partition(at - 1, 60_000, place);
    expect(window.switches[0]!.at.getTime()).toBe(at);
    expect(window.cells[0]!.milliseconds).toBe(1);
    expect(unconfirmedSwitches(window, place)).toEqual([]);
  });
});

describe("close and simultaneous switches", () => {
  // At a RAMC of 270° the ascendant is at 0° Aries and the midheaven at 0°
  // Capricorn. Five minutes after the Sun's March ingress the Sun is at about
  // 0.0035°, which the ascendant at 45° N passes some 0.4 s later.
  const [ingress] = findLongitudeCrossings("Sun", 0, new Date(Date.UTC(2031, 2, 19)), new Date(Date.UTC(2031, 2, 22)), 1);
  const target = ingress!.at.getTime() + 300_000;
  natalChart({ utc: new Date(target) });
  SetDeltaTFunction(deltaT);
  const gast = SiderealTime(MakeTime(new Date(target))) * 15;
  const east = ((((270 - gast) % 360) + 540) % 360) - 180;
  const holding = (window: BirthWindow, test: (change: BirthWindow["switches"][number]["changes"][number]) => boolean) =>
    window.switches.filter((entry) => entry.changes.some(test));

  it("two features switching within one second of each other, and two at the same millisecond", () => {
    const place: Place = { latitude: 45, longitude: east, houseSystem: "equal" };
    const window = partition(target - 10_000, 20_000, place);
    const [rising] = holding(window, (change) => change.feature === "ascendant");
    const [sun] = holding(window, (change) => change.feature === "house" && change.body === "Sun");
    expect(rising!.changes).toEqual([
      { feature: "ascendant", from: "pisces", to: "aries" },
      { feature: "midheaven", from: "sagittarius", to: "capricorn" }
    ]);
    expect(sun!.changes).toEqual([{ feature: "house", body: "Sun", from: 1, to: 12 }]);
    const apart = sun!.at.getTime() - rising!.at.getTime();
    expect(apart).toBeGreaterThan(0);
    expect(apart).toBeLessThan(1000);
    expectExact(window, place);
  }, 60_000);

  it("fourteen features switching at the same millisecond", () => {
    const place: Place = { latitude: 45, longitude: east, houseSystem: "whole" };
    const window = partition(target - 10_000, 20_000, place);
    expect(window.switches).toHaveLength(1);
    const changes = window.switches[0]!.changes;
    expect(changes.slice(0, 2).map((change) => change.feature)).toEqual(["ascendant", "midheaven"]);
    expect(changes.filter((change) => change.feature === "house")).toHaveLength(12);
    expectExact(window, place);
  }, 60_000);
});

describe("stations near a sign boundary", () => {
  it("a station just inside a boundary: Uranus turns 0.0017° short of Leo", () => {
    // Engine station of 2122-11-05T11:40:13.5Z at 119.99830°.
    const station = Date.UTC(2122, 10, 5, 11, 40, 13, 521);
    const place: Place = { latitude: 30, longitude: 31, houseSystem: "whole" };
    const window = partition(station - DAY, 2 * DAY, place);
    expect(window.switches.flatMap((entry) => entry.changes).filter((change) => change.feature === "sign" && change.body === "Uranus")).toEqual([]);
    expect(window.cells.every((cell) => cell.features.signs.Uranus === "cancer")).toBe(true);
    expect(unconfirmedSwitches(window, place)).toEqual([]);
    // natalChart agrees at every second of the 20 minutes around the station and every minute of the two days.
    const near = partition(station - 600_000, 1_200_000, place);
    expect(disagreementsEverySecond(near, place)).toEqual([]);
    expect(disagreementsEverySecond(window, place, 60_000)).toEqual([]);
  }, 180_000);

  it("a station just past a boundary: Mercury enters Aquarius by 0.0034° and returns", () => {
    // Engine station of 1970-01-04T08:12:27.2Z at 300.00338°.
    const station = Date.UTC(1970, 0, 4, 8, 12, 27, 223);
    const place: Place = { latitude: -33.9, longitude: 18.4, houseSystem: "porphyry" };
    const window = partition(station - DAY, 2 * DAY, place);
    const mercury = window.switches.flatMap((entry) =>
      entry.changes
        .filter((change) => change.feature === "sign" && change.body === "Mercury")
        .map((change) => ({ at: entry.at.getTime(), change }))
    );
    expect(mercury.map(({ change }) => change)).toEqual([
      { feature: "sign", body: "Mercury", from: "capricorn", to: "aquarius" },
      { feature: "sign", body: "Mercury", from: "aquarius", to: "capricorn" }
    ]);
    expect(mercury[0]!.at).toBeLessThan(station);
    expect(mercury[1]!.at).toBeGreaterThan(station);
    expect(unconfirmedSwitches(window, place)).toEqual([]);
    expect(disagreementsEverySecond(window, place, 60_000)).toEqual([]);
  }, 180_000);

  // Inside the polar circle the raw ascendant turns back where the horizon
  // meets the ecliptic on the meridian, which is where the engine turns the
  // ascendant half a circle. With the turning point 0.001° inside a boundary
  // the ascendant jumps once; 0.001° past it, it crosses, jumps and recrosses.
  const flipDate = Date.UTC(2031, 6, 9, 20, 40, 55);
  const obliquity = chartDeclinations(natalChart({ utc: new Date(flipDate) })).trueObliquity;
  const latitudeFor = (turn: number) => {
    const c = Math.cos(obliquity * DEG);
    const k = Math.sqrt(c * c + 1 / Math.tan(turn * DEG) ** 2);
    return Math.atan(k / Math.sin(obliquity * DEG)) * RAD;
  };
  const ascendantChanges = (window: BirthWindow) =>
    window.switches.flatMap((entry) => entry.changes.filter((change) => change.feature === "ascendant"));

  it("the polar ascendant turning 0.001° inside Scorpio's end jumps once", () => {
    const place: Place = { latitude: latitudeFor(59.999), longitude: 0, houseSystem: "equal" };
    const window = partition(flipDate - 300_000, 600_000, place);
    expect(ascendantChanges(window)).toEqual([{ feature: "ascendant", from: "scorpio", to: "taurus" }]);
    expectExact(window, place);
  }, 60_000);

  it("the polar ascendant turning 0.001° past it crosses, jumps and recrosses", () => {
    const place: Place = { latitude: latitudeFor(60.001), longitude: 0, houseSystem: "equal" };
    const window = partition(flipDate - 300_000, 600_000, place);
    expect(ascendantChanges(window)).toEqual([
      { feature: "ascendant", from: "scorpio", to: "sagittarius" },
      { feature: "ascendant", from: "sagittarius", to: "gemini" },
      { feature: "ascendant", from: "gemini", to: "taurus" }
    ]);
    expectExact(window, place);
  }, 60_000);
});

describe("Placidus and Koch at the polar circle", () => {
  it("switches between the requested system and its whole-sign fallback where the obliquity crosses 90° − |φ|", () => {
    const at = Date.UTC(2040, 1, 11, 6, 0, 0);
    const epsilon = chartDeclinations(natalChart({ utc: new Date(at) })).trueObliquity;
    for (const houseSystem of ["placidus", "koch"] as const) {
      const place: Place = { latitude: 90 - epsilon, longitude: 12, houseSystem };
      const window = partition(at - 300_000, 600_000, place);
      const system = window.switches.flatMap((entry) => entry.changes.filter((change) => change.feature === "house-system"));
      expect(system).toHaveLength(1);
      expect(window.flags).toContain("polar-fallback");
      expectExact(window, place);
    }
  }, 120_000);

  it("stays on the fallback inside the polar circle", () => {
    const place: Place = { latitude: 70, longitude: 25, houseSystem: "placidus" };
    const window = partition(Date.UTC(1999, 11, 31, 22, 0, 0), 3_600_000, place);
    expect(window.cells.every((cell) => cell.features.houseSystem === "whole")).toBe(true);
    expect(window.flags).toEqual(["polar-fallback"]);
    expectExact(window, place, 10_000);
  }, 60_000);
});

describe("the true node's jitter", () => {
  it("reports, and natalChart confirms, each change of a jittering node's house", () => {
    // Far from J2000 the node moves by up to 3.5e-5° between milliseconds,
    // so its house can change back and forth as a cusp passes it.
    const place: Place = { latitude: 52, longitude: 4.9, houseSystem: "placidus" };
    const window = partition(Date.UTC(2195, 4, 17, 0, 0, 0), DAY, place);
    const node = window.switches.filter((entry) => entry.changes.some((change) => change.feature === "house" && change.body.endsWith("Node")));
    expect(node.length).toBeGreaterThanOrEqual(24);
    expect(unconfirmedSwitches(window, place)).toEqual([]);
    expect(disagreementsEverySecond(window, place, 60_000)).toEqual([]);
  }, 300_000);
});

describe("Placidus just below the polar limit", () => {
  it("keeps Placidus through the review's reproduction, where the iteration alone fell back", () => {
    // 3e-9° below the limit, with the RAMC passing 270°: 26 milliseconds of
    // the 2.4 s around 2000-03-20T00:00Z fell back before the bisection.
    const t0 = Date.UTC(2000, 2, 20);
    const place: Place = { latitude: 66.56186339751429, longitude: 92.16879370494166, houseSystem: "placidus" };
    const window = partition(t0 - 1_200, 2_400, place);
    expect(window.flags).toEqual([]);
    expect(window.cells.every((cell) => cell.features.houseSystem === "placidus")).toBe(true);
    expect(disagreementsEverySecond(window, place, 1)).toEqual([]);
    expect(unconfirmedSwitches(window, place)).toEqual([]);
  }, 120_000);
});

describe("the ΔT model's seam", () => {
  // deltat.ts hands over from its spline to its table at 1941.0, where ΔT
  // steps from 24.834 s to 24.820 s and TT steps back 13.95 ms.
  const seam = Date.UTC(DELTA_T_TABLE.from - 1, 11, 31, 18);
  const place: Place = { latitude: 51.5, longitude: -0.12, houseSystem: "equal" };
  /** Instants in [from, to) at which a body's longitude steps back against its motion. */
  const backSteps = (body: "Moon" | "Sun", from: number, to: number) => {
    SetDeltaTFunction(deltaT);
    const found: number[] = [];
    let previous = Number.NaN;
    for (let time = from; time < to; time += 1) {
      e_tilt(MakeTime(new Date(time + DAY)));
      const value = bodyLongitude(body, new Date(time));
      if (value < previous && previous - value < 1) found.push(time);
      previous = value;
    }
    return found;
  };

  it("is the only discontinuity of ΔT inside the reference span", () => {
    // Every knot of the table, where the linear pieces meet, and each end of
    // the observed and predicted parts, 1 ms either side.
    const ut = (year: number) => (year - 2000) * 365.25;
    const knots = [DELTA_T_TABLE.from];
    for (let year = DELTA_T_TABLE.from + 1; year < 2026; year += 1) knots.push(year);
    const obs = 2000 + (DELTA_T_TABLE.observedTo - 51544.5) / 365.25;
    const pred = 2000 + (DELTA_T_TABLE.predictedTo - 51544.5) / 365.25;
    for (let k = 0; k <= 4; k += 1) knots.push(obs + (k * (pred - obs)) / 4);
    for (let year = 1805; year < 2200; year += 5) knots.push(year);
    const steps = knots.map((year) => deltaT(ut(year) + 1 / DAY) - deltaT(ut(year) - 1 / DAY));
    expect(Math.abs(steps[0]! + 0.0139)).toBeLessThan(0.001);
    expect(steps.slice(1).every((step) => Math.abs(step) < 1e-9)).toBe(true);
  });

  it("agrees with natalChart at every millisecond across the Moon's and the node's steps", () => {
    expect(backSteps("Moon", seam - 3, seam + 3)).toEqual([seam]);
    const window = partition(seam - 1_500, 3_000, place);
    expect(window.flags).toEqual([]);
    expect(disagreementsEverySecond(window, place, 1)).toEqual([]);
    expect(unconfirmedSwitches(window, place)).toEqual([]);
  }, 120_000);

  it("agrees with natalChart at every millisecond across the Sun's step, one light time later", () => {
    const [step] = backSteps("Sun", seam + 480_000, seam + 520_000);
    expect(step).toBeDefined();
    const window = partition(step! - 1_000, 2_000, place);
    expect(window.flags).toEqual([]);
    expect(disagreementsEverySecond(window, place, 1)).toEqual([]);
  }, 120_000);
});

describe("sign ingresses of the true node", () => {
  it("resolves every flicker of a fast ingress, where natalChart confirms each", () => {
    // 2012-08-30, the node moving at 0.19°/day: its jitter makes the sign
    // change back and forth for some tens of seconds.
    const ingress = Date.parse("2012-08-30T02:55:46.875Z");
    const place: Place = { latitude: 40.4, longitude: -3.7, houseSystem: "koch" };
    const window = partition(ingress - 600_000, 1_200_000, place);
    expect(window.flags).toEqual([]);
    expect(window.unresolved).toEqual([]);
    const node = window.switches.filter((entry) => entry.changes.some((change) => change.feature === "sign" && change.body === "North Node"));
    expect(node.length).toBeGreaterThan(2);
    expect(unconfirmedSwitches(window, place)).toEqual([]);
    expect(disagreementsEverySecond(window, place)).toEqual([]);
  }, 120_000);

  it("leaves a slow ingress unresolved, and flags it, rather than run out of budget", () => {
    // 1981-09-20, the node moving at 0.004°/day: its sign would change back
    // and forth at millions of milliseconds.
    const place: Place = { latitude: 51.5, longitude: -0.12, houseSystem: "placidus" };
    const centre = Date.parse("1981-09-20T15:45:00Z");
    const window = partition(centre - 3_600_000, 7_200_000, place);
    expect(window.flags).toEqual(["node-unresolved"]);
    expect(window.unresolved).toHaveLength(1);
    const [gap] = window.unresolved;
    expect(gap!.features).toEqual([
      { feature: "sign", body: "North Node" },
      { feature: "sign", body: "South Node" }
    ]);
    expect(gap!.milliseconds).toBe(gap!.end.getTime() - gap!.start.getTime());
    for (const cell of window.cells) {
      const inside = cell.start.getTime() >= gap!.start.getTime() && cell.end.getTime() <= gap!.end.getTime();
      const outside = cell.end.getTime() <= gap!.start.getTime() || cell.start.getTime() >= gap!.end.getTime();
      expect(inside || outside).toBe(true);
      expect(cell.features.signs["North Node"] === null).toBe(inside);
      expect(cell.features.signs["South Node"] === null).toBe(inside);
    }
    // Every other feature agrees with natalChart; the nodes' signs do outside the interval.
    const found = disagreementsEverySecond(window, place, 10_000).filter((line) => {
      const time = Date.parse(line.slice(0, 24));
      const unresolved = time >= gap!.start.getTime() && time < gap!.end.getTime();
      return !(unresolved && / sign:(North|South) Node: /.test(line));
    });
    expect(found).toEqual([]);
    const confirmed = unconfirmedSwitches(window, place).filter((line) => !/ sign:(North|South) Node: /.test(line));
    expect(confirmed).toEqual([]);
  }, 120_000);
});

describe("shares", () => {
  const place: Place = { latitude: 40, longitude: -74, houseSystem: "placidus" };

  it("tile the window, with uniform shares that sum to one", () => {
    const window = partition(Date.UTC(1988, 2, 1, 9, 0, 0), 2 * 3_600_000, place);
    let at = window.start.getTime();
    for (const cell of window.cells) {
      expect(cell.start.getTime()).toBe(at);
      expect(cell.milliseconds).toBe(cell.end.getTime() - at);
      expect(cell.share).toBe(cell.milliseconds / (2 * 3_600_000));
      at = cell.end.getTime();
    }
    expect(at).toBe(window.end.getTime());
    expect(window.cells.reduce((sum, cell) => sum + cell.milliseconds, 0)).toBe(2 * 3_600_000);
    expect(window.switches.map((entry) => entry.at.getTime())).toEqual(window.cells.slice(1).map((cell) => cell.start.getTime()));
  });

  it("follow a rounding model: a record rounded to five minutes inside a ±10 minute window", () => {
    const recorded = Date.UTC(1988, 2, 1, 14, 30);
    const window = birthWindow({ at: new Date(recorded), minutes: 10, ...place, rounding: { recorded: new Date(recorded), minutes: 5 } });
    expect(window.start.getTime()).toBe(recorded - 600_000);
    expect(window.end.getTime()).toBe(recorded + 600_000);
    expect(window.rounding).toEqual({ recorded: new Date(recorded), minutes: 5, mode: "nearest", start: new Date(recorded - 150_000), end: new Date(recorded + 150_000) });
    let total = 0;
    for (const cell of window.cells) {
      const overlap = Math.max(0, Math.min(cell.end.getTime(), recorded + 150_000) - Math.max(cell.start.getTime(), recorded - 150_000));
      expect(cell.roundedShare).toBe(overlap / 300_000);
      total += cell.roundedShare!;
    }
    expect(total).toBeCloseTo(1, 12);
  });

  it("take the rounding unit as the window when no other is given", () => {
    const recorded = Date.UTC(1988, 2, 1, 14, 35);
    const down = birthWindow({ ...place, rounding: { recorded: new Date(recorded), minutes: 1, mode: "down" } });
    expect(down.start.getTime()).toBe(recorded);
    expect(down.end.getTime()).toBe(recorded + 60_000);
    for (const cell of down.cells) expect(cell.roundedShare).toBe(cell.share);
  });
});

describe("results", () => {
  const place: Place = { latitude: -23.5, longitude: -46.6, houseSystem: "campanus" };

  it("are labelled as sampled, not proven, and repeat exactly", () => {
    const first = partition(Date.UTC(2010, 9, 10, 10, 10, 10), 3_600_000, place);
    expect(first.verification).toBe(WINDOW_VERIFICATION);
    expect(WINDOW_VERIFICATION).toBe("sampled at one-second resolution");
    expect(first.schema).toBe("zodiacs.birth-window.v1");
    expect(first.houseSystem).toBe("campanus");
    expect(JSON.parse(JSON.stringify(partition(Date.UTC(2010, 9, 10, 10, 10, 10), 3_600_000, place)))).toEqual(JSON.parse(JSON.stringify(first)));
  });

  it("lie inside the reference span, where the bounds were scanned", () => {
    expect(() => partition(Date.UTC(1799, 11, 31, 23, 50), 1_200_000, place)).toThrow(RangeError);
    expect(() => partition(Date.UTC(2199, 11, 31, 23, 50), 1_200_000, place)).toThrow(RangeError);
    expect(partition(Date.UTC(1800, 0, 1), 1_200_000, place).flags).toEqual([]);
    expect(partition(Date.UTC(2200, 0, 1) - 1_200_000, 1_200_000, place).flags).toEqual([]);
  });

  it("report an exhausted budget with an error of its own", () => {
    const error = new WindowBudgetError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("WindowBudgetError");
    expect(error.limit).toBe(2_000_000);
  });

  it("publish their rate bounds", () => {
    expect(Object.isFrozen(WINDOW_RATE_BOUNDS)).toBe(true);
    expect(WINDOW_RATE_BOUNDS.Moon).toBe(31);
    expect(MAX_WINDOW_MS).toBe(48 * 3_600_000);
  });
});

describe("invalid input", () => {
  const place: Place = { latitude: 10, longitude: 10, houseSystem: "whole" };
  const start = new Date(Date.UTC(2000, 0, 1));
  const cases: [string, Record<string, unknown>][] = [
    ["no window", { ...place }],
    ["an empty window", { ...place, start, end: start }],
    ["a window ending before it starts", { ...place, start, end: new Date(start.getTime() - 1) }],
    ["a window over 48 hours", { ...place, start, end: new Date(start.getTime() + MAX_WINDOW_MS + 1) }],
    ["both forms of window", { ...place, start, end: new Date(start.getTime() + 1000), at: start, minutes: 1 }],
    ["zero minutes", { ...place, at: start, minutes: 0 }],
    ["a local date-time", { ...place, start: "2000-01-01T00:00:00", end: "2000-01-01T01:00:00Z" }],
    ["no place", { start, end: new Date(start.getTime() + 1000) }],
    ["a latitude past the pole", { ...place, latitude: 91, start, end: new Date(start.getTime() + 1000) }],
    ["the north pole, where no ascendant is defined", { ...place, latitude: 90, start, end: new Date(start.getTime() + 1000) }],
    ["the south pole", { ...place, latitude: -90, start, end: new Date(start.getTime() + 1000) }],
    ["a latitude within 1e-6° of the north pole", { ...place, latitude: 90 - 5e-7, start, end: new Date(start.getTime() + 1000) }],
    ["a latitude within 1e-6° of the south pole", { ...place, latitude: -90 + 5e-7, start, end: new Date(start.getTime() + 1000) }],
    ["a window before 1800", { ...place, start: new Date(Date.UTC(1799, 11, 31, 23, 59)), end: new Date(Date.UTC(1800, 0, 1, 0, 1)) }],
    ["a window after 2200", { ...place, start: new Date(Date.UTC(2199, 11, 31, 23, 59)), end: new Date(Date.UTC(2200, 0, 1, 0, 1)) }],
    ["an unknown house system", { ...place, houseSystem: "koch-ish", start, end: new Date(start.getTime() + 1000) }],
    ["a rounding unit outside the window", { ...place, start, end: new Date(start.getTime() + 60_000), rounding: { recorded: start, minutes: 5 } }],
    ["an unknown rounding mode", { ...place, rounding: { recorded: start, minutes: 5, mode: "up" } }]
  ];
  for (const [label, input] of cases) {
    it(`rejects ${label}`, () => {
      expect(() => birthWindow(input as never)).toThrow(RangeError);
    });
  }
});
