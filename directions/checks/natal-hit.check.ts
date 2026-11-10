import { describe, expect, it } from "vitest";
import { hit, type HitInput } from "../src/hit.js";
import { prepareNatal, type NatalSnapshot } from "../src/natal.js";
import {
  hitFromNatal, type NatalHitResult, type NatalHitSelection
} from "../src/natal-hit.js";
import type { SolarEquatorialDay } from "../src/timing.js";

// Synthetic data only. These comparisons establish adapter value preservation,
// not independent ephemeris or arc accuracy. Independent hit examples are in
// hit.check.ts and the evidence fixtures used by the primitive solver checks.
const natal = prepareNatal({
  utc: "2000-01-01T12:00:00Z", timeScale: "ut1", timeKnown: true,
  latitude: 35, longitude: 15, houseSystem: "placidus", deltaT: 64
});

const base = {
  convention: { system: "placidus-semiarc", mode: "mundane", latitude: "retain-both", motion: "direct", key: "ptolemy" },
  significator: { kind: "body", id: "Moon" }, promissor: { kind: "body", id: "Sun" },
  contact: { kind: "conjunction" }, yearUnit: "julian-365.25-days"
} as const satisfies NatalHitSelection;

const solar: SolarEquatorialDay = {
  timeScale: "tt", frame: "true-equator-equinox-of-date", center: "geocentric", correction: "apparent",
  start: { jdTt: 2451545, rightAscensionDegrees: 10 },
  end: { jdTt: 2451546, rightAscensionDegrees: 11 }
};

type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
function mutable(): Mutable<NatalSnapshot> { return JSON.parse(JSON.stringify(natal)) as Mutable<NatalSnapshot>; }

function unchecked(snapshot: unknown, ...args: [] | [unknown]): NatalHitResult {
  const selection = args.length === 0 ? base : args[0];
  return hitFromNatal(snapshot as NatalSnapshot, selection as NatalHitSelection);
}

function ok(result: NatalHitResult): Extract<NatalHitResult, { status: "ok" }> {
  expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error(JSON.stringify(result));
  return result;
}

function frozen(value: unknown): void {
  expect(value).not.toBeInstanceOf(Date);
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) frozen(child);
  }
}

function directInput(snapshot: NatalSnapshot, selection: NatalHitSelection): HitInput {
  function body(id: string) {
    const row = snapshot.chart.bodies.find(row => row.body === id)!;
    const eq = snapshot.equatorial.rows.find(row => row.body === id)!;
    return { kind: "body" as const, id, coordinates: selection.convention.mode === "zodiacal"
      ? { longitudeDegrees: row.lon, latitudeDegrees: row.lat }
      : { rightAscensionDegrees: eq.ra!, declinationDegrees: eq.dec } };
  }
  return {
    ...selection,
    geometry: selection.convention.mode === "zodiacal"
      ? { ramcDegrees: snapshot.geometry.ramcDegrees, latitudeDegrees: snapshot.geometry.latitudeDegrees,
        trueObliquityDegrees: snapshot.geometry.trueObliquityDegrees }
      : { ramcDegrees: snapshot.geometry.ramcDegrees, latitudeDegrees: snapshot.geometry.latitudeDegrees },
    significator: selection.significator.kind === "body" ? body(selection.significator.id) : selection.significator,
    promissor: body(selection.promissor.id)
  } as HitInput;
}

describe("natal hit data path (engine integration, not independent numerical accuracy)", () => {
  for (const timeScale of ["utc", "ut1", "tt"] as const) {
    for (const pin of [undefined, 123.5]) {
      it(`preserves ${timeScale} time and provenance with ${pin === undefined ? "model" : "pinned"} deltaT`, () => {
        const snapshot = prepareNatal({
          utc: "2000-01-01T12:00:00Z", timeScale, timeKnown: true,
          latitude: 35, longitude: 15, houseSystem: "placidus",
          ...(pin === undefined ? {} : { deltaT: pin })
        });
        const result = ok(hitFromNatal(snapshot, base));
        expect(result.natal.timeScale).toEqual(snapshot.chart.timeScale);
        expect(result.natal.deltaT).toEqual(snapshot.chart.deltaT);
        expect(result.natal.provenance).toEqual(snapshot.provenance);
        expect(result.natal.instantLabel).toBe(snapshot.chart.input.utc);
        expect(result.natal.timeScale.input).toBe(timeScale);
        if (pin !== undefined) expect(result.natal.deltaT).toMatchObject({ seconds: pin, model: "pinned" });
      });
    }
  }

  for (const mode of ["zodiacal", "mundane"] as const) {
    for (const kind of ["body", "angle"] as const) {
      for (const key of ["ptolemy", "naibod", "solar-equatorial-birth-day"] as const) {
        it(`preserves ${mode} ${kind} coordinates through the ${key} hit`, () => {
          const selection = {
            ...base,
            convention: { ...base.convention, mode, latitude: mode === "zodiacal" ? "zero-both" : "retain-both", key },
            significator: kind === "body" ? base.significator : { kind: "angle", angle: "mc" },
            ...(key === "solar-equatorial-birth-day" ? { solar } : {})
          } as NatalHitSelection;
          const result = ok(hitFromNatal(natal, selection));
          const { natal: audit, ...calculation } = result;
          expect(calculation).toEqual(hit(directInput(natal, selection)));
          const sun = natal.chart.bodies.find(row => row.body === "Sun")!;
          expect(audit.promissor).toEqual({ kind: "body", id: "Sun", ecliptic: { longitudeDegrees: sun.lon, latitudeDegrees: sun.lat } });
          expect(audit.solarEpochAssociation).toBe(key === "solar-equatorial-birth-day" ? "caller-supplied-unverified" : null);
          if (kind === "angle") expect(audit.significator).toEqual({ kind: "angle", angle: "mc", longitudeDegrees: natal.chart.angles.mc });
          else {
            const moon = natal.chart.bodies.find(row => row.body === "Moon")!;
            expect(audit.significator).toEqual({ kind: "body", id: "Moon", ecliptic: { longitudeDegrees: moon.lon, latitudeDegrees: moon.lat } });
          }
          frozen(result);
          expect(JSON.parse(JSON.stringify(result))).toEqual(result);
        });
      }
    }
  }

  it("keeps natal house choice separate from the named primary-direction system", () => {
    const snapshot = prepareNatal({
      utc: "2001-03-05T06:00:00Z", timeScale: "utc", timeKnown: true,
      latitude: -35, longitude: 15, houseSystem: "whole"
    });
    const result = ok(hitFromNatal(snapshot, base));
    expect(result.natal.houseSystem).toBe("whole");
    expect(result.convention.system).toBe("placidus-semiarc");
    expect(result.natal.timeScale).toEqual(snapshot.chart.timeScale);
    expect(result.natal.deltaT).toEqual(snapshot.chart.deltaT);
    expect(result.natal.geometry).toEqual(snapshot.geometry);
    expect(result.natal.provenance).toEqual(snapshot.provenance);
    expect(result.natal.instantLabel).toBe(snapshot.chart.input.utc);
  });

  it("retains the full bodily latitude in mundane equatorial rows", () => {
    const selection = { ...base, promissor: { kind: "body", id: "Moon" } } as const;
    const result = ok(hitFromNatal(natal, selection));
    const eq = natal.equatorial.rows.find(row => row.body === "Moon")!;
    expect(eq.lat).not.toBe(0);
    expect(result.promissor.coordinates).toEqual({ rightAscensionDegrees: eq.ra, declinationDegrees: eq.dec });
    expect(result.natal.promissor.ecliptic.latitudeDegrees).toBe(eq.lat);
  });

  it("preserves converse labels and forwards unsupported constructions", () => {
    const convention = { ...base.convention, motion: "converse", converseConstruction: "placidus-role-swap" } as const;
    const result = ok(hitFromNatal(natal, { ...base, convention }));
    expect(result.significator).toMatchObject({ kind: "body", id: "Moon" });
    expect(result.promissor.id).toBe("Sun");
    expect(result.geometry).toMatchObject({ solver: "mundane-body", calculation: { geometry: { movingRole: "significator" } } });
    expect(hitFromNatal(natal, { ...base, convention, significator: { kind: "angle", angle: "asc" } }))
      .toMatchObject({ status: "refused", stage: "angle", code: "unsupported-converse-angle" });
    expect(hitFromNatal(natal, { ...base, convention: { ...convention, mode: "zodiacal", latitude: "zero-both" } }))
      .toMatchObject({ status: "refused", stage: "zodiacal", code: "unsupported-converse-zodiacal" });
  });

  it("forwards mode-specific aspect branches without using natal aspect metadata", () => {
    for (const mode of ["zodiacal", "mundane"] as const) {
      const selection = {
        ...base,
        convention: { ...base.convention, mode, latitude: mode === "zodiacal" ? "zero-both" : "retain-both" },
        contact: { kind: "aspect", aspect: "square", branch: mode === "zodiacal" ? "dexter" : "westward" }
      } as NatalHitSelection;
      const { natal: _audit, ...result } = ok(hitFromNatal(natal, selection));
      expect(result).toEqual(hit(directInput(natal, selection)));
      expect(result.kind).toBe("aspect-to-body");
    }
    expect(hitFromNatal(natal, { ...base, significator: { kind: "angle", angle: "asc" },
      contact: { kind: "aspect", aspect: "opposition" } })).toMatchObject({ status: "refused", stage: "angle", code: "unsupported-angle-aspect" });
  });

  it("does not claim solar samples are bound to the supplied natal instant", () => {
    // Intentionally unrelated TT samples demonstrate the explicit limitation;
    // they do not serve as natal-key or astronomical accuracy expectations.
    const otherEpoch = { ...solar, start: { ...solar.start, jdTt: 100 }, end: { ...solar.end, jdTt: 101 } };
    const result = ok(hitFromNatal(natal, {
      ...base, convention: { ...base.convention, key: "solar-equatorial-birth-day" }, solar: otherEpoch
    }));
    expect(result.natal.solarEpochAssociation).toBe("caller-supplied-unverified");
    expect(result.timing.audit).toMatchObject({ kind: "solar-birth-day", samples: otherEpoch });
  });

  it("copies and freezes consumed metadata without freezing or retaining caller objects", () => {
    const snapshot = mutable();
    const selection = structuredClone(base);
    const result = ok(hitFromNatal(snapshot, selection));
    const before = JSON.stringify(result);
    frozen(result);
    expect(Object.isFrozen(snapshot)).toBe(false);
    expect(Object.isFrozen(snapshot.geometry)).toBe(false);
    expect(Object.isFrozen(snapshot.provenance.ephemeris)).toBe(false);
    expect(Object.isFrozen(selection.convention)).toBe(false);
    snapshot.geometry.latitudeDegrees = -35;
    snapshot.provenance.ephemeris.version = "another-version";
    snapshot.chart.deltaT.seconds = 10;
    snapshot.chart.flags.push("lmt");
    snapshot.chart.bodies.find(row => row.body === "Moon")!.lat = 0;
    snapshot.equatorial.rows.find(row => row.body === "Sun")!.ra = 0;
    Object.assign(selection.convention, { key: "naibod" });
    expect(JSON.stringify(result)).toBe(before);
    expect(() => Object.assign(result.natal.provenance.ephemeris, { version: "change" })).toThrow(TypeError);
  });
});

describe("natal hit validation and selected data boundaries", () => {
  it("requires explicit exact selection fields and labels", () => {
    for (const bad of [null, undefined, [], true, new Date(), Object.create(base)]) {
      expect(unchecked(natal, bad)).toMatchObject({ status: "refused", stage: "input", code: "invalid-input" });
    }
    for (const key of ["convention", "significator", "promissor", "contact", "yearUnit"]) {
      const selection: Record<string, unknown> = { ...base };
      delete selection[key];
      expect(unchecked(natal, selection)).toMatchObject({ status: "refused", stage: "input", code: "invalid-input" });
    }
    for (const bad of [
      { ...base, geometry: natal.geometry }, { ...base, unknown: true }, { ...base, [Symbol("extra")]: true },
      { ...base, significator: { kind: "body", id: "Moon", coordinates: {} } },
      { ...base, significator: { kind: "angle", angle: "vertex" } },
      { ...base, promissor: { kind: "angle", angle: "mc" } },
      ...["", " Moon", "Moon ", "M\u0000oon", "x".repeat(81)].map(id => ({ ...base, promissor: { kind: "body", id } }))
    ]) expect(unchecked(natal, bad)).toMatchObject({ status: "refused", stage: "input", code: "invalid-input" });
    expect(unchecked(natal, Object.assign(Object.create(null), base)).status).toBe("ok");
  });

  it("keeps downstream convention, contact and timing failures typed", () => {
    expect(unchecked(natal, { ...base, convention: { ...base.convention, latitude: "zero-both" } }))
      .toMatchObject({ status: "refused", stage: "convention", code: "invalid-input" });
    expect(unchecked(natal, { ...base, contact: { kind: "aspect", aspect: "square" } }))
      .toMatchObject({ status: "refused", stage: "input", code: "invalid-input" });
    expect(unchecked(natal, { ...base, yearUnit: "calendar" }))
      .toMatchObject({ status: "refused", stage: "timing", code: "invalid-input" });
    expect(unchecked(natal, { ...base, solar }))
      .toMatchObject({ status: "refused", stage: "input", code: "invalid-input" });
    expect(unchecked(natal, { ...base, convention: { ...base.convention, key: "solar-equatorial-birth-day" } }))
      .toMatchObject({ status: "refused", stage: "timing", code: "invalid-input" });
  });

  it("refuses missing and duplicate selected rows without choosing an arbitrary match", () => {
    expect(unchecked(natal, { ...base, promissor: { kind: "body", id: "sun" } }))
      .toMatchObject({ status: "refused", stage: "natal", code: "missing-body" });
    for (const location of ["bodies", "equatorial"] as const) {
      const missing = mutable();
      const duplicate = mutable();
      if (location === "bodies") {
        missing.chart.bodies = missing.chart.bodies.filter(row => row.body !== "Moon");
        duplicate.chart.bodies.push({ ...duplicate.chart.bodies.find(row => row.body === "Moon")! });
      } else {
        missing.equatorial.rows = missing.equatorial.rows.filter(row => row.body !== "Moon");
        duplicate.equatorial.rows.push({ ...duplicate.equatorial.rows.find(row => row.body === "Moon")! });
      }
      expect(unchecked(missing)).toMatchObject({ status: "refused", stage: "natal", code: "missing-body" });
      expect(unchecked(duplicate)).toMatchObject({ status: "refused", stage: "natal", code: "ambiguous-body" });
    }
  });

  it("checks selected ecliptic rows agree before retaining equatorial coordinates", () => {
    for (const field of ["lon", "lat"] as const) {
      const snapshot = mutable();
      snapshot.equatorial.rows.find(row => row.body === "Moon")![field] += 1;
      expect(unchecked(snapshot)).toMatchObject({ status: "refused", stage: "natal", code: "inconsistent-snapshot" });
    }
    for (const field of ["ra", "dec"] as const) {
      const snapshot = mutable();
      snapshot.equatorial.rows.find(row => row.body === "Moon")![field] = Infinity;
      expect(unchecked(snapshot)).toMatchObject({ status: "refused", stage: "natal", code: "invalid-snapshot" });
    }
    const undefinedRa = mutable();
    Object.assign(undefinedRa.equatorial.rows.find(row => row.body === "Moon")!, { ra: null, raDefined: false });
    expect(unchecked(undefinedRa)).toMatchObject({ status: "refused", stage: "natal", code: "undefined-right-ascension" });
  });

  it("rejects inherited, hidden, missing and noncanonical consumed snapshot data", () => {
    for (const snapshot of [null, undefined, [], new Date(), Object.create(natal)]) {
      expect(unchecked(snapshot)).toMatchObject({ status: "refused", stage: "natal", code: "invalid-snapshot" });
    }
    const hidden = mutable();
    Object.defineProperty(hidden.geometry, "ramcDegrees", { enumerable: false });
    const hole = mutable();
    delete hole.chart.bodies[0];
    const noncanonical = mutable();
    noncanonical.chart.bodies.find(row => row.body === "Sun")!.lon = 360;
    const inherited = mutable();
    inherited.provenance = Object.create(natal.provenance) as Mutable<NatalSnapshot>["provenance"];
    for (const snapshot of [hidden, hole, noncanonical, inherited]) {
      expect(unchecked(snapshot)).toMatchObject({ status: "refused", stage: "natal", code: "invalid-snapshot" });
    }
  });

  it("checks the consumed clock, place, frame and provenance claims for consistency", () => {
    const changes: ((snapshot: Mutable<NatalSnapshot>) => void)[] = [
      snapshot => { snapshot.chart.input.timeKnown = false; },
      snapshot => { snapshot.chart.input.latitude = -35; },
      snapshot => { snapshot.chart.input.longitude = -15; },
      snapshot => { snapshot.chart.input.houseSystem = "whole"; },
      snapshot => { snapshot.chart.input.timeScale = "tt"; },
      snapshot => { snapshot.chart.flags.push("polar-fallback"); },
      snapshot => { snapshot.chart.engineVersion = "another-version"; },
      snapshot => { snapshot.equatorial.utc = "2001-01-01T12:00:00.000Z"; },
      snapshot => { snapshot.equatorial.trueObliquity += 1; },
      snapshot => { snapshot.equatorial.deltaT.seconds += 1; }
    ];
    for (const change of changes) {
      const snapshot = mutable();
      change(snapshot);
      expect(unchecked(snapshot)).toMatchObject({ status: "refused", stage: "natal", code: "inconsistent-snapshot" });
    }
    const polar = mutable();
    polar.geometry.latitudeDegrees = polar.chart.input.latitude = 80;
    expect(unchecked(polar)).toMatchObject({ status: "refused", stage: "natal", code: "polar-geometry" });
    const invalidDate = mutable();
    invalidDate.chart.input.utc = "2000-02-30T00:00:00.000Z";
    expect(unchecked(invalidDate)).toMatchObject({ status: "refused", stage: "natal", code: "invalid-snapshot" });
  });

  it("never invokes accessor slots, including array entries and candidate labels", () => {
    let reads = 0;
    const get = () => { reads++; throw new Error("Getter executed"); };
    const snapshots: Mutable<NatalSnapshot>[] = [];
    const geometry = mutable();
    Object.defineProperty(geometry.geometry, "ramcDegrees", { get });
    snapshots.push(geometry);
    const longitude = mutable();
    Object.defineProperty(longitude.chart.bodies.find(row => row.body === "Moon")!, "lon", { get });
    snapshots.push(longitude);
    const candidateLabel = mutable();
    Object.defineProperty(candidateLabel.chart.bodies[0]!, "body", { get });
    snapshots.push(candidateLabel);
    const entry = mutable();
    Object.defineProperty(entry.equatorial.rows, "0", { get });
    snapshots.push(entry);
    const time = mutable();
    Object.defineProperty(time.chart.timeScale, "input", { get });
    snapshots.push(time);
    for (const snapshot of snapshots) {
      expect(unchecked(snapshot)).toMatchObject({ status: "refused", stage: "natal", code: "invalid-snapshot" });
    }
    const selection = { ...base };
    Object.defineProperty(selection, "promissor", { get });
    expect(unchecked(natal, selection)).toMatchObject({ status: "refused", stage: "input", code: "invalid-input" });
    expect(reads).toBe(0);
  });

  it("leaves unselected coordinates and unrelated chart metadata unread", () => {
    let reads = 0;
    const get = () => { reads++; throw new Error("Unused getter executed"); };
    const snapshot = mutable();
    Object.defineProperty(snapshot.chart, "aspects", { get });
    Object.defineProperty(snapshot.chart.houses, "cusps", { get });
    Object.defineProperty(snapshot.chart.bodies.find(row => row.body === "Mars")!, "lon", { get });
    Object.defineProperty(snapshot.equatorial.rows.find(row => row.body === "Mars")!, "ra", { get });
    Object.defineProperty(snapshot.provenance, "unused", { get });
    expect(unchecked(snapshot)).toEqual(hitFromNatal(natal, base));
    const zodiacal = { ...base, convention: { ...base.convention, mode: "zodiacal", latitude: "zero-both" } } as const;
    Object.defineProperty(snapshot, "equatorial", { get });
    Object.defineProperty(snapshot.chart, "angles", { get });
    expect(unchecked(snapshot, zodiacal)).toEqual(hitFromNatal(natal, zodiacal));
    expect(reads).toBe(0);
  });

  it("keeps all returned refusals deeply frozen", () => {
    for (const result of [unchecked(null), unchecked(natal, null), unchecked(natal, { ...base, yearUnit: null })]) frozen(result);
  });
});
