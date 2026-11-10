import { afterEach, describe, expect, it, vi } from "vitest";
import type { SkyEventKind } from "../../src/sky/riseset.js";
import { crescentEvents } from "../src/crescent-search.js";
import * as engine from "../src/engine.js";
import type { HorizonEvents, ReceiptedSkyEvent } from "../src/engine.js";
import * as geometryModule from "../src/geometry.js";
import type { SunBodyGeometry } from "../src/geometry.js";
import type { DateInput } from "../src/inputs.js";
import odeh from "./fixtures/odeh-reference.json" with { type: "json" };
import yallop from "./fixtures/yallop-reference.json" with { type: "json" };

const SITE = { latitude: 0, longitude: 0, height: 0 };
const START = Date.parse("2001-02-03T00:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RAD = Math.PI / 180;
const AU_KM = 149_597_870.7;
const EARTH_RADIUS_KM = 6378.1366;
const MOON_RADIUS_KM = 1737.4;
const YALLOP = "yallop-1997/1";
const ODEH = "odeh-2006/1";
type Model = typeof YALLOP | typeof ODEH;
type Period = "morning" | "evening";

function time(day: number, hour = 0): number { return START + day * DAY + hour * HOUR; }
function iso(day: number, hour = 0): string { return new Date(time(day, hour)).toISOString(); }
function best(day: number, period: Period): number {
  // Four ninths of a one-hour lag is exactly 1,600,000 milliseconds.
  return time(day, period === "evening" ? 18 : 6) + (period === "evening" ? 1 : -1) * 1_600_000;
}

// Expected scores are the committed independent Decimal calculations of
// Yallop TN69, equations 3.8-3.10 and 6.1, and Odeh (2006), equation 2.
// The fixtures cite source URLs and page locators. The schedule below is
// invented and checks the search's assembly of those criteria, not observed
// lunar sightings, ephemeris accuracy or the validity of the morning extension.
function fixtureGeometry(model: Model, category: string, at: number, period: Period): SunBodyGeometry {
  const yr = yallop.criterionCases.find((row) => row.expected.category === category)!;
  const or = odeh.criterionCases.find((row) => row.expected.category === category)!;
  const elongation = model === YALLOP ? yr.sample.elongationGeocentricDeg : 16;
  const parallax = model === YALLOP ? yr.sample.moonHorizontalParallaxArcmin : 60;
  const geoDistance = EARTH_RADIUS_KM / Math.sin(parallax / 60 * RAD) / AU_KM;
  const geoMoonAltitude = model === YALLOP ? yr.sample.moonAltitudeGeocentricDeg : 7;
  const geoSunAltitude = model === YALLOP ? yr.sample.sunAltitudeGeocentricDeg : -7;
  const topoMoonAltitude = model === ODEH ? or.sample.moonAltitudeTopocentricDeg : geoMoonAltitude - 0.5;
  const topoSunAltitude = model === ODEH ? or.sample.sunAltitudeTopocentricDeg : geoSunAltitude;
  const topoElongation = 16;
  const topoSemidiameter = model === ODEH
    ? or.sample.crescentWidthTopocentricArcmin / (2 * Math.sin(topoElongation * RAD / 2) ** 2)
    : 16;
  const topoDistance = MOON_RADIUS_KM / Math.sin(topoSemidiameter / 60 * RAD) / AU_KM;
  const longitude = period === "evening" ? elongation : 360 - elongation;
  const pair = (topocentric: boolean) => ({
    elongationDeg: topocentric ? topoElongation : elongation,
    sun: {
      horizontal: { altitudeDeg: topocentric ? topoSunAltitude : geoSunAltitude, azimuthDeg: 270, hourAngleDeg: 90 },
      equatorial: { status: "ok", lon: 0, lat: 0, dist: 1, receipt: { fixture: "sun-equatorial" } },
      ecliptic: { status: "ok", lon: 0, lat: 0, dist: 1, receipt: { fixture: "sun-ecliptic" } }
    },
    target: {
      horizontal: { altitudeDeg: topocentric ? topoMoonAltitude : geoMoonAltitude, azimuthDeg: 270, hourAngleDeg: 80 },
      equatorial: {
        status: "ok", lon: longitude, lat: 0, dist: topocentric ? topoDistance : geoDistance,
        receipt: { fixture: "moon-equatorial" }
      },
      ecliptic: {
        status: "ok", lon: longitude, lat: 0, dist: topocentric ? topoDistance : geoDistance,
        receipt: { fixture: "moon-ecliptic" }
      }
    }
  });
  // Structural doubles carry identifiable receipt objects but are deliberately
  // not authentic engine receipts. Distances invert geometric definitions to
  // supply the fixture's input parallax or width, not an ephemeris expectation.
  return {
    status: "ok", body: "Moon", at: new Date(at).toISOString(), observer: SITE,
    geocentric: pair(false), topocentric: pair(true), receiptScope: "positions"
  } as unknown as SunBodyGeometry;
}

function schedule(model: Model, morning: readonly string[], evening: readonly string[]) {
  if (morning.length !== evening.length) throw new Error("Schedule lengths differ");
  const days = morning.length;
  const event = (kind: SkyEventKind, day: number, hour: number): ReceiptedSkyEvent => ({
    kind, at: new Date(time(day, hour)), altitude: 0, azimuth: 0,
    position: { status: "ok", receipt: { fixture: `${kind}-${day}-${hour}` } }
  } as unknown as ReceiptedSkyEvent);
  const sun: ReceiptedSkyEvent[] = [];
  const moon: ReceiptedSkyEvent[] = [];
  const geometryByTime = new Map<number, SunBodyGeometry>();
  for (let day = 0; day < days; day += 1) {
    sun.push(event("lower-transit", day, 0), event("rise", day, 6),
      event("upper-transit", day, 12), event("set", day, 18));
    moon.push(event("rise", day, 5), event("set", day, 19));
    geometryByTime.set(best(day, "morning"), fixtureGeometry(model, morning[day]!, best(day, "morning"), "morning"));
    geometryByTime.set(best(day, "evening"), fixtureGeometry(model, evening[day]!, best(day, "evening"), "evening"));
  }
  sun.push(event("lower-transit", days, 0));
  const horizon = (body: "Sun" | "Moon", events: ReceiptedSkyEvent[]): HorizonEvents => ({
    status: "complete", body, events, samples: 1, flags: [], observer: SITE,
    from: new Date(time(0)), to: new Date(time(days)),
    conventions: { limb: "upper", refraction: "standard", refractionArcmin: 34 },
    engine: { name: "@zodiacs/engine", fixture: "synthetic" }, receiptScope: "event-positions"
  } as unknown as HorizonEvents);
  const horizons = { sun: horizon("Sun", sun), moon: horizon("Moon", moon) };
  const solve = vi.spyOn(engine, "horizonEvents").mockImplementation((body) => {
    if (body !== "Sun" && body !== "Moon") throw new Error("Unexpected target");
    return body === "Sun" ? horizons.sun : horizons.moon;
  });
  const geometry = vi.spyOn(geometryModule, "sunBodyGeometry").mockImplementation((_body, at: DateInput) => {
    const ms = at instanceof Date ? at.getTime() : typeof at === "number" ? at : Date.parse(at);
    const result = geometryByTime.get(ms);
    if (!result) throw new Error(`Geometry requested away from a synthetic best time: ${new Date(ms).toISOString()}`);
    return result;
  });
  return { days, sun, moon, horizons, solve, geometry, geometryByTime };
}

afterEach(() => vi.restoreAllMocks());

describe.each([YALLOP, ODEH] as const)("crescent search with %s independent criterion fixtures", (model) => {
  it("reports first evening and last morning at the passing best time and preserves source identities", () => {
    const setup = schedule(model, ["A", "B", "C"], ["C", "B", "A"]);
    const result = crescentEvents(SITE, iso(0), iso(setup.days), {
      model, lastAcceptedCategory: "B", maxElongationDeg: 30, morningTiming: "mirror-evening"
    });
    expect(result.status).toBe("complete");
    expect(result.events.map(({ appearance, at }) => [appearance, at])).toEqual([
      ["last-morning", new Date(best(1, "morning")).toISOString()],
      ["first-evening", new Date(best(1, "evening")).toISOString()]
    ]);
    expect(result.horizons.sun).toBe(setup.horizons.sun);
    expect(result.horizons.moon).toBe(setup.horizons.moon);
    expect(result.diagnostics).toContainEqual({ code: "morning-symmetry-extension" });
    expect(setup.solve).toHaveBeenCalledTimes(2);
    expect(setup.geometry).toHaveBeenCalledTimes(6);
    for (const row of result.opportunities) {
      if (row.status !== "evaluated") throw new Error("Expected evaluated opportunity");
      expect(row.geometry).toBe(setup.geometryByTime.get(Date.parse(row.bestTime.at)));
      expect(row.bestTime).toMatchObject({
        lagMilliseconds: HOUR,
        offsetMilliseconds: 1_600_000,
        rule: row.period === "evening" ? "evening-four-ninths" : "morning-mirrored-four-ninths-extension"
      });
      expect(setup.sun).toContain(row.sunCrossing);
      expect(setup.moon).toContain(row.moonCrossing);
      expect(row.eligibilityFailures).toEqual([]);
      const reference = (model === YALLOP ? yallop : odeh).criterionCases
        .find((item) => item.expected.category === row.criterion.category)!;
      for (const field of ["arcOfVisionDeg", "crescentWidthArcmin", "referenceArcOfVisionDeg"] as const) {
        expect(Math.abs(row.criterion[field] - reference.expected[field]), field).toBeLessThanOrEqual(1e-12);
      }
      if (row.criterion.model === YALLOP) {
        const ref = yallop.criterionCases.find((item) => item.expected.category === row.criterion.category)!;
        expect(Math.abs(row.criterion.q - ref.expected.q)).toBeLessThanOrEqual(yallop.tolerance.numericAbsolute);
      } else {
        const ref = odeh.criterionCases.find((item) => item.expected.category === row.criterion.category)!;
        expect(Math.abs(row.criterion.v - ref.expected.v)).toBeLessThanOrEqual(odeh.tolerance.numericAbsolute);
      }
      expect(row.passesSelection).toBe(row.criterion.category === "A" || row.criterion.category === "B");
    }
    for (const event of result.events) {
      const first = event.appearance === "first-evening";
      expect(event.bracket.before.passesSelection).toBe(!first);
      expect(event.bracket.after.passesSelection).toBe(first);
      const passing = first ? event.bracket.after : event.bracket.before;
      if (passing.status !== "evaluated") throw new Error("Expected passing evaluated opportunity");
      expect(event.at).toBe(passing.bestTime.at);
      expect(event.receiptScope).toBe("positions");
      expect(event.interpretation).toBe(first ? "evening-criterion" : "morning-symmetry-extension");
      expect(result.opportunities).toContain(passing);
    }
  });

  it("does not infer events from range edges and leaves the morning extension disabled by default", () => {
    const setup = schedule(model, ["A", "C"], ["A", "A"]);
    const result = crescentEvents(SITE, iso(0), iso(setup.days), {
      model, lastAcceptedCategory: "B", maxElongationDeg: 30
    });
    expect(result.status).toBe("complete");
    expect(result.events).toEqual([]);
    expect(result.opportunities.every((row) => row.period === "evening")).toBe(true);
    expect(setup.geometry.mock.calls.map((call) => new Date(call[1]).toISOString())).toEqual([
      new Date(best(0, "evening")).toISOString(), new Date(best(1, "evening")).toISOString()
    ]);
  });

  it.each(["missing", "multiple"] as const)("breaks evening adjacency across a %s moonset without breaking morning adjacency", (gap) => {
    const setup = schedule(model, ["A", "B", "C"], ["C", "B", "A"]);
    const middle = setup.moon[3]!;
    if (gap === "missing") setup.moon.splice(3, 1);
    else setup.moon.push({ ...middle, at: new Date(time(1, 20)) });
    setup.moon.sort((a, b) => a.at.getTime() - b.at.getTime());
    const result = crescentEvents(SITE, iso(0), iso(setup.days), {
      model, lastAcceptedCategory: "B", maxElongationDeg: 30, morningTiming: "mirror-evening"
    });
    expect(result.status).toBe("complete");
    expect(result.events.map((row) => row.appearance)).toEqual(["last-morning"]);
    const evenings = result.opportunities.filter((row) => row.period === "evening");
    expect(evenings.map((row) => row.status)).toEqual(["evaluated", "unavailable", "evaluated"]);
    expect(setup.geometry).toHaveBeenCalledTimes(5);
  });

  it.each(["missing", "multiple"] as const)("breaks morning adjacency across a %s sunrise", (gap) => {
    const setup = schedule(model, ["A", "B", "C"], ["C", "B", "A"]);
    const middle = setup.sun.findIndex((row) => row.kind === "rise" && row.at.getTime() === time(1, 6));
    if (gap === "missing") setup.sun.splice(middle, 1);
    else setup.sun.push({ ...setup.sun[middle]!, at: new Date(time(1, 7)) });
    setup.sun.sort((a, b) => a.at.getTime() - b.at.getTime());
    const result = crescentEvents(SITE, iso(0), iso(setup.days), {
      model, lastAcceptedCategory: "B", maxElongationDeg: 30, morningTiming: "mirror-evening"
    });
    expect(result.status).toBe("complete");
    expect(result.events.map((row) => row.appearance)).toEqual(["first-evening"]);
    const mornings = result.opportunities.filter((row) => row.period === "morning");
    expect(mornings.map((row) => row.status)).toEqual(["evaluated", "unavailable", "evaluated"]);
    expect(mornings[1]).toMatchObject({
      reason: gap === "missing" ? "missing-sun-crossing" : "multiple-sun-crossings"
    });
    expect(setup.geometry).toHaveBeenCalledTimes(5);
  });

  it.each([17, 18])("treats moonset at %i:00 as a known nonpositive lag instead of wrapping it onto another day", (hour) => {
    const setup = schedule(model, ["A", "A", "A"], ["A", "A", "A"]);
    setup.moon[3] = { ...setup.moon[3]!, at: new Date(time(1, hour)) };
    const result = crescentEvents(SITE, iso(0), iso(setup.days), {
      model, lastAcceptedCategory: "B", maxElongationDeg: 30
    });
    expect(result.status).toBe("complete");
    expect(result.opportunities[1]).toMatchObject({ status: "ineligible", passesSelection: false, bestTime: null });
    expect(result.events.map(({ appearance, at }) => [appearance, at])).toEqual([
      ["first-evening", new Date(best(2, "evening")).toISOString()]
    ]);
    expect(setup.geometry).toHaveBeenCalledTimes(2);
  });

  it("places a last morning before a nonpositive lag without evaluating the failed opportunity", () => {
    const setup = schedule(model, ["A", "A"], ["A", "A"]);
    setup.moon[2] = { ...setup.moon[2]!, at: new Date(time(1, 7)) };
    const result = crescentEvents(SITE, iso(0), iso(setup.days), {
      model, lastAcceptedCategory: "B", maxElongationDeg: 30, morningTiming: "mirror-evening"
    });
    expect(result.status).toBe("complete");
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event).toMatchObject({
      appearance: "last-morning", at: new Date(best(0, "morning")).toISOString(),
      bracket: {
        from: iso(0, 5), to: iso(1, 7),
        before: { status: "evaluated", passesSelection: true },
        after: { status: "ineligible", reason: "nonpositive-lag", lagMilliseconds: -HOUR,
          passesSelection: false, bestTime: null }
      }
    });
    if (event.bracket.before.status !== "evaluated") throw new Error("Expected evaluated passing morning");
    expect(event.at).toBe(event.bracket.before.bestTime.at);
    for (const row of [event.bracket.before, event.bracket.after]) {
      for (const source of [row.sunCrossing, row.moonCrossing]) {
        expect(source.at.getTime()).toBeGreaterThanOrEqual(Date.parse(event.bracket.from));
        expect(source.at.getTime()).toBeLessThanOrEqual(Date.parse(event.bracket.to));
      }
    }
    expect(setup.geometry).toHaveBeenCalledTimes(3);
    expect(setup.geometry.mock.calls.map((call) => new Date(call[1]).toISOString())).toEqual([
      new Date(best(0, "morning")).toISOString(), new Date(best(0, "evening")).toISOString(),
      new Date(best(1, "evening")).toISOString()
    ]);
  });

  it("does not use a source sunset before the range to infer a first evening", () => {
    const setup = schedule(model, ["A", "A"], ["C", "A"]);
    const result = crescentEvents(SITE, iso(0, 18 + 1 / 6), iso(setup.days), {
      model, lastAcceptedCategory: "B", maxElongationDeg: 30
    });
    expect(result.status).toBe("complete");
    expect(result.events).toEqual([]);
    expect(result.opportunities[0]).toMatchObject({ status: "unavailable", reason: "sun-crossing-outside-range" });
    expect(setup.geometry).toHaveBeenCalledTimes(1);
  });

  it("does not evaluate a setting pair whose moonset is at the excluded range end", () => {
    const setup = schedule(model, ["A", "A"], ["C", "A"]);
    const result = crescentEvents(SITE, iso(0), iso(1, 19), {
      model, lastAcceptedCategory: "B", maxElongationDeg: 30
    });
    expect(result.status).toBe("complete");
    expect(result.events).toEqual([]);
    expect(result.opportunities.at(-1)).toMatchObject({ status: "unavailable", reason: "moon-crossing-outside-range" });
    expect(setup.geometry).toHaveBeenCalledTimes(1);
  });
});

describe("explicit crescent selection gates", () => {
  it.each(["A", "B", "C", "D"] as const)("accepts every Yallop category through %s and rejects the following category", (category) => {
    const categories = ["A", "B", "C", "D", "E", "F"];
    const setup = schedule(YALLOP, categories, categories);
    const result = crescentEvents(SITE, iso(0), iso(setup.days), {
      model: YALLOP, lastAcceptedCategory: category, maxElongationDeg: 30
    });
    expect(result.status).toBe("complete");
    expect(result.opportunities.map((row) => row.status === "unavailable" ? null : row.passesSelection))
      .toEqual(categories.map((value) => categories.indexOf(value) <= categories.indexOf(category)));
  });

  it.each(["A", "B", "C"] as const)("accepts every Odeh category through %s and rejects the following category", (category) => {
    const categories = ["A", "B", "C", "D"];
    const setup = schedule(ODEH, categories, categories);
    const result = crescentEvents(SITE, iso(0), iso(setup.days), {
      model: ODEH, lastAcceptedCategory: category, maxElongationDeg: 30
    });
    expect(result.status).toBe("complete");
    expect(result.opportunities.map((row) => row.status === "unavailable" ? null : row.passesSelection))
      .toEqual(categories.map((value) => categories.indexOf(value) <= categories.indexOf(category)));
  });

  it("rejects the wrong synodic side despite a selected criterion category", () => {
    const setup = schedule(YALLOP, ["A", "A"], ["A", "A"]);
    const before = setup.geometryByTime.get(best(0, "evening"))!;
    setup.geometryByTime.set(best(0, "evening"), {
      ...before,
      geocentric: { ...before.geocentric, target: {
        ...before.geocentric.target, ecliptic: { ...before.geocentric.target.ecliptic, lon: 344 }
      } }
    });
    const result = crescentEvents(SITE, iso(0), iso(setup.days), {
      model: YALLOP, lastAcceptedCategory: "A", maxElongationDeg: 30
    });
    expect(result.status).toBe("complete");
    expect(result.opportunities[0]).toMatchObject({
      status: "evaluated", criterion: { category: "A" }, passesSelection: false
    });
    const first = result.opportunities[0]!;
    if (first.status !== "evaluated") throw new Error("Expected evaluated opportunity");
    expect(first.eligibilityFailures).not.toEqual([]);
    expect(result.events.map((row) => row.at)).toEqual([new Date(best(1, "evening")).toISOString()]);
  });

  it("accepts equality at the explicit geocentric elongation limit", () => {
    const setup = schedule(YALLOP, ["A", "A"], ["A", "A"]);
    const before = setup.geometryByTime.get(best(0, "evening"))!;
    setup.geometryByTime.set(best(0, "evening"), {
      ...before, geocentric: { ...before.geocentric, elongationDeg: 16.01 }
    });
    const result = crescentEvents(SITE, iso(0), iso(setup.days), {
      model: YALLOP, lastAcceptedCategory: "A", maxElongationDeg: 16
    });
    expect(result.status).toBe("complete");
    expect(result.opportunities.map((row) => row.status === "unavailable" ? null : row.passesSelection)).toEqual([false, true]);
    expect(result.events.map((row) => row.at)).toEqual([new Date(best(1, "evening")).toISOString()]);
  });
});
