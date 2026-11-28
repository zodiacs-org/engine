import { describe, expect, it } from "vitest";
import { eclipticToEquatorial } from "../../src/declination.js";
import {
  zodiacalBodyArc, ZodiacalDirectionError, SphereGeometryError
} from "../src/index.js";
import type {
  ZodiacalBodyInput, ZodiacalContact, ZodiacalDirectionErrorCode, SphereGeometryErrorCode
} from "../src/index.js";
import { prepareNatal } from "../src/natal.js";

const base = {
  system: "placidus-semiarc", mode: "zodiacal", latitude: "zero-both", motion: "direct",
  geometry: { ramcDegrees: 150, latitudeDegrees: 35, trueObliquityDegrees: 0 },
  significator: { longitudeDegrees: 30, latitudeDegrees: 4 },
  promissor: { longitudeDegrees: 70, latitudeDegrees: -3 },
  contact: { kind: "conjunction" }
} as const satisfies ZodiacalBodyInput;

const contacts = [
  { kind: "conjunction" }, { kind: "aspect", aspect: "opposition" },
  ...(["sextile", "square", "trine"] as const).flatMap(aspect =>
    (["dexter", "sinister"] as const).map(branch => ({ kind: "aspect" as const, aspect, branch })))
] as const satisfies readonly ZodiacalContact[];

function refused(input: unknown, code: ZodiacalDirectionErrorCode = "invalid-input"): void {
  let caught: unknown;
  try { zodiacalBodyArc(input as ZodiacalBodyInput); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(ZodiacalDirectionError);
  expect(caught).toBeInstanceOf(RangeError);
  expect(caught).toMatchObject({ name: "ZodiacalDirectionError", code });
}

function sphereRefused(input: unknown, code: SphereGeometryErrorCode): void {
  let caught: unknown;
  try { zodiacalBodyArc(input as ZodiacalBodyInput); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(SphereGeometryError);
  expect(caught).not.toBeInstanceOf(ZodiacalDirectionError);
  expect(caught).toMatchObject({ name: "SphereGeometryError", code });
}

// Chosen before executing this suite. These analytic examples set obliquity
// to zero, so the planes coincide: RA = longitude, declination = 0,
// D = N = 90, and arc = (promissor-ray longitude - significator longitude)
// modulo one turn. This is exact geometry, not a prior computed fixture.
const equatorialToleranceDegrees = 1e-10;
function near(actual: number, expected: number): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(equatorialToleranceDegrees);
}

function frozenData(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const entry of Object.values(value)) frozenData(entry);
  }
}

describe("zodiacal equatorial analytic geometry", () => {
  it("reduces to longitude differences throughout both hemispheres and all quadrants", () => {
    for (const [significator, promissor, expected] of [
      [30, 70, 40], [300, 40, 100], [40, 300, 260], [0, 180, 180], [270, 90, 180]
    ] as const) {
      for (const ramcDegrees of [0, 45, 90, 135, 180, 225, 270, 315]) {
        for (const latitudeDegrees of [-70, 0, 70]) {
          const result = zodiacalBodyArc({ ...base,
            geometry: { ramcDegrees, latitudeDegrees, trueObliquityDegrees: 0 },
            significator: { longitudeDegrees: significator, latitudeDegrees: 4 },
            promissor: { longitudeDegrees: promissor, latitudeDegrees: -3 }
          });
          near(result.arcDegrees, expected);
          near(result.geometry.significator.rightAscensionDegrees, significator);
          near(result.geometry.promissor.rightAscensionDegrees, promissor);
          for (const point of [result.geometry.significator, result.geometry.promissor]) {
            expect(point.latitudeDegrees).toBe(0);
            expect(point.declinationDegrees).toBe(0);
            expect(point.position.semiArcs.diurnalSemiArcDegrees).toBe(90);
            expect(point.position.semiArcs.nocturnalSemiArcDegrees).toBe(90);
          }
          expect(result.geometry).toMatchObject({
            projection: "@zodiacs/engine:eclipticToEquatorial", movingRole: "promissor-ray",
            fixedRole: "significator", rotation: "westward", coincident: false
          });
        }
      }
    }
  });

  it("returns exact positive zero for coincident projected points at arbitrary longitudes", () => {
    // Equal projected points have the same temporal position for every valid
    // obliquity and latitude. The expected zero follows from their identity.
    for (const longitudeDegrees of [0, 0.1, 30, 61.234567, 90, 179.123456, 180, 270, 359.9]) {
      for (const ramcDegrees of [0, 40.125, 180, 315]) {
        for (const trueObliquityDegrees of [0, 23.5, 45]) {
          const result = zodiacalBodyArc({ ...base,
            geometry: { ramcDegrees, latitudeDegrees: 20, trueObliquityDegrees },
            significator: { longitudeDegrees, latitudeDegrees: 90 },
            promissor: { longitudeDegrees, latitudeDegrees: -90 }
          });
          expect(Object.is(result.arcDegrees, 0)).toBe(true);
          expect(result.geometry).toMatchObject({ coincident: true, wholeTurnsAdded: 0, unreducedArcDegrees: 0 });
        }
      }
    }
  });

  it("applies each ecliptic aspect branch and preserves the original bodily coordinates", () => {
    // With S = 10 and P = 20, each arc is 10 plus its signed ray offset,
    // reduced by a complete turn. The ray itself is P plus the offset.
    const cases: readonly { contact: ZodiacalContact; offset: number; ray: number; arc: number }[] = [
      { contact: { kind: "conjunction" }, offset: 0, ray: 20, arc: 10 },
      { contact: { kind: "aspect", aspect: "opposition" }, offset: 180, ray: 200, arc: 190 },
      { contact: { kind: "aspect", aspect: "sextile", branch: "dexter" }, offset: -60, ray: 320, arc: 310 },
      { contact: { kind: "aspect", aspect: "sextile", branch: "sinister" }, offset: 60, ray: 80, arc: 70 },
      { contact: { kind: "aspect", aspect: "square", branch: "dexter" }, offset: -90, ray: 290, arc: 280 },
      { contact: { kind: "aspect", aspect: "square", branch: "sinister" }, offset: 90, ray: 110, arc: 100 },
      { contact: { kind: "aspect", aspect: "trine", branch: "dexter" }, offset: -120, ray: 260, arc: 250 },
      { contact: { kind: "aspect", aspect: "trine", branch: "sinister" }, offset: 120, ray: 140, arc: 130 }
    ];
    for (const fixture of cases) {
      const significator = { longitudeDegrees: 10, latitudeDegrees: 7 };
      const promissor = { longitudeDegrees: 20, latitudeDegrees: -5 };
      const result = zodiacalBodyArc({ ...base, significator, promissor, contact: fixture.contact });
      near(result.arcDegrees, fixture.arc);
      expect(result.kind).toBe(fixture.contact.kind === "conjunction" ? "conjunction-to-body" : "aspect-to-body");
      expect(result.contact).toEqual(fixture.contact);
      expect(result.significator).toEqual(significator);
      expect(result.promissor).toEqual(promissor);
      expect(result.geometry.rayOffsetDegrees).toBe(fixture.offset);
      expect(result.geometry.promissor.longitudeDegrees).toBe(fixture.ray);
      near(result.geometry.promissor.rightAscensionDegrees, fixture.ray);
    }
  });
});

describe("zodiacal explicit conventions and data validation", () => {
  it("requires every top-level and nested field and refuses unknown fields", () => {
    const records = { root: base, geometry: base.geometry, significator: base.significator,
      promissor: base.promissor, contact: base.contact };
    for (const [name, record] of Object.entries(records)) {
      const withRecord = (value: unknown): unknown => name === "root" ? value : { ...base, [name]: value };
      for (const field of Object.keys(record)) {
        const missing: Record<string, unknown> = { ...record };
        delete missing[field];
        refused(withRecord(missing));
      }
      for (const value of [{ ...record, extra: true }, { ...record, [Symbol("extra")]: true },
        Object.defineProperty({ ...record }, "hidden", { value: true })]) refused(withRecord(value));
      for (const value of [undefined, null, false, 1, "data", [], () => record,
        Object.create(record), Object.assign(Object.create({ inherited: true }), record)]) refused(withRecord(value));
    }
    refused({ ...base, key: "ptolemy" });
    refused({ ...base, converseConstruction: "placidus-role-swap" });
    refused({ ...base, converseConstruction: undefined });
  });

  it("never invokes accessors at any accepted object depth", () => {
    let reads = 0;
    const records = { root: base, geometry: base.geometry, significator: base.significator,
      promissor: base.promissor, contact: { kind: "aspect", aspect: "square", branch: "dexter" } };
    for (const [name, record] of Object.entries(records)) {
      const withRecord = (value: unknown): unknown => name === "root" ? value : { ...base, [name]: value };
      for (const field of Object.keys(record)) {
        refused(withRecord(Object.defineProperty({ ...record }, field, {
          get() { reads++; return "unused"; }, enumerable: true
        })));
        refused(withRecord(Object.defineProperty({ ...record }, field, { enumerable: false })));
      }
    }
    refused(Object.defineProperty({ ...base, motion: "converse" }, "converseConstruction", {
      get() { reads++; return "placidus-role-swap"; }, enumerable: true
    }));
    expect(reads).toBe(0);
  });

  it("refuses every unsupported system, mode, latitude and motion choice without a default", () => {
    for (const [field, values] of Object.entries({
      system: [undefined, null, "placidus", "regiomontanus", 0],
      mode: [undefined, null, "mundane", "Zodiacal", false],
      latitude: [undefined, null, "retain-both", "zero-promissor", "zero-significator", false],
      motion: [undefined, null, "Direct", "reverse", true]
    })) for (const value of values) refused({ ...base, [field]: value });
    for (const mode of ["zodiacal", "mundane"]) {
      for (const latitude of ["zero-both", "retain-both"]) {
        if (mode !== "zodiacal" || latitude !== "zero-both") refused({ ...base, mode, latitude });
      }
    }
  });

  it("gives a typed refusal for all zodiacal converse contacts, including conjunction", () => {
    for (const contact of contacts) {
      refused({ ...base, contact, motion: "converse", converseConstruction: "placidus-role-swap" },
        "unsupported-converse-zodiacal");
      refused({ ...base, contact, motion: "converse" });
      for (const converseConstruction of [undefined, null, "reverse-rotation", "placidus-direct"]) {
        refused({ ...base, contact, motion: "converse", converseConstruction });
      }
    }
  });

  it("requires explicit supported aspect branches and forbids meaningless branch fields", () => {
    for (const contact of [
      { kind: "conjunction", branch: "dexter" }, { kind: "conjunction", aspect: "conjunction" },
      { kind: "aspect" }, { kind: "aspect", aspect: "conjunction" }, { kind: "aspect", aspect: "quintile", branch: "dexter" },
      { kind: "aspect", aspect: "opposition", branch: "dexter" },
      { kind: "aspect", aspect: "opposition", branch: undefined },
      { kind: "parallel" }, { kind: null }, { kind: undefined }
    ]) refused({ ...base, contact });
    for (const aspect of ["sextile", "square", "trine"]) {
      refused({ ...base, contact: { kind: "aspect", aspect } });
      for (const branch of [undefined, null, "left", "Dexter", false]) {
        refused({ ...base, contact: { kind: "aspect", aspect, branch } });
      }
    }
  });

  it("validates finite canonical degrees before projecting away either bodily latitude", () => {
    for (const [name, record] of Object.entries({ geometry: base.geometry,
      significator: base.significator, promissor: base.promissor })) {
      for (const field of Object.keys(record)) {
        for (const value of [undefined, null, "0", false, NaN, Infinity, -Infinity]) {
          refused({ ...base, [name]: { ...record, [field]: value } });
        }
        const invalidRange = field === "latitudeDegrees" ? [-90.001, 90.001]
          : field === "trueObliquityDegrees" ? [-0.001, 90] : [-0.001, 360];
        for (const value of invalidRange) refused({ ...base, [name]: { ...record, [field]: value } });
      }
    }
  });

  it("accepts frozen and null-prototype plain data without weakening validation", () => {
    const normal = zodiacalBodyArc(base);
    const input = Object.assign(Object.create(null), base, {
      geometry: Object.assign(Object.create(null), base.geometry),
      significator: Object.assign(Object.create(null), base.significator),
      promissor: Object.assign(Object.create(null), base.promissor),
      contact: Object.assign(Object.create(null), base.contact)
    });
    expect(zodiacalBodyArc(input)).toEqual(normal);
    Object.values(input).forEach(value => { if (typeof value === "object" && value !== null) Object.freeze(value); });
    expect(zodiacalBodyArc(Object.freeze(input))).toEqual(normal);
  });
});

describe("zodiacal domain, provenance and immutable results", () => {
  it("propagates geographic poles and circumpolar projected rays without changing systems", () => {
    for (const latitudeDegrees of [-90, 90]) {
      sphereRefused({ ...base, geometry: { ...base.geometry, latitudeDegrees } }, "geographic-pole");
    }
    // At epsilon=45, lambda=90 has declination +45 and lambda=270 has
    // declination -45. In latitude +/-60 the same-signed circle is always
    // above the horizon, the opposite-signed circle always below it.
    for (const latitudeDegrees of [-60, 60]) {
      for (const [longitudeDegrees, declinationSign] of [[90, 1], [270, -1]] as const) {
        const code = Math.sign(latitudeDegrees) === declinationSign ? "circumpolar-above" : "circumpolar-below";
        for (const role of ["significator", "promissor"]) {
          sphereRefused({ ...base,
            geometry: { ramcDegrees: 0, latitudeDegrees, trueObliquityDegrees: 45 },
            significator: { longitudeDegrees: 0, latitudeDegrees: 0 },
            promissor: { longitudeDegrees: 0, latitudeDegrees: 0 },
            [role]: { longitudeDegrees, latitudeDegrees: 0 }
          }, code);
        }
      }
      sphereRefused({ ...base,
        geometry: { ramcDegrees: 0, latitudeDegrees, trueObliquityDegrees: 45 },
        significator: { longitudeDegrees: 0, latitudeDegrees: 0 },
        promissor: { longitudeDegrees: 0, latitudeDegrees: 0 },
        contact: { kind: "aspect", aspect: "square", branch: "sinister" }
      }, latitudeDegrees > 0 ? "circumpolar-above" : "circumpolar-below");
    }
  });

  it("preserves synthetic natal metadata and uses the public engine projection (integration only)", () => {
    const natal = prepareNatal({
      utc: "2000-01-01T12:00:00Z", timeScale: "ut1", timeKnown: true,
      latitude: 35, longitude: 15, houseSystem: "placidus", deltaT: 64
    });
    const sun = natal.chart.bodies.find(body => body.body === "Sun");
    const moon = natal.chart.bodies.find(body => body.body === "Moon");
    if (!sun || !moon) throw new Error("Synthetic chart needs Sun and Moon");
    const result = zodiacalBodyArc({ ...base,
      geometry: { ramcDegrees: natal.geometry.ramcDegrees, latitudeDegrees: natal.geometry.latitudeDegrees,
        trueObliquityDegrees: natal.geometry.trueObliquityDegrees },
      significator: { longitudeDegrees: sun.lon, latitudeDegrees: sun.lat },
      promissor: { longitudeDegrees: moon.lon, latitudeDegrees: moon.lat }
    });
    expect(result.geometry).toMatchObject({
      ramcDegrees: natal.geometry.ramcDegrees, latitudeDegrees: natal.geometry.latitudeDegrees,
      trueObliquityDegrees: natal.geometry.trueObliquityDegrees,
      projection: "@zodiacs/engine:eclipticToEquatorial"
    });
    for (const [role, body] of [["significator", sun], ["promissor", moon]] as const) {
      expect(result[role]).toEqual({ longitudeDegrees: body.lon, latitudeDegrees: body.lat });
      const projected = eclipticToEquatorial(body.lon, 0, natal.geometry.trueObliquityDegrees);
      expect(result.geometry[role]).toMatchObject({ longitudeDegrees: body.lon, latitudeDegrees: 0,
        rightAscensionDegrees: projected.ra, declinationDegrees: projected.dec });
    }
    // This test checks data flow and helper reuse, never an expected arc.
    expect(natal.chart.houses.system).toBe("placidus");
    expect(natal.chart.timeScale.input).toBe("ut1");
  });

  it("returns fresh deeply frozen snapshots without freezing or retaining caller objects", () => {
    const input: ZodiacalBodyInput = { ...base, geometry: { ...base.geometry },
      significator: { ...base.significator }, promissor: { ...base.promissor },
      contact: { kind: "aspect", aspect: "square", branch: "dexter" } };
    const before = JSON.stringify(input);
    const result = zodiacalBodyArc(input);
    const encoded = JSON.stringify(result);
    const again = zodiacalBodyArc(input);
    frozenData(result);
    expect(JSON.stringify(input)).toBe(before);
    expect(again).toEqual(result);
    for (const object of [input, input.geometry, input.significator, input.promissor, input.contact]) {
      expect(Object.isFrozen(object)).toBe(false);
    }
    expect(again).not.toBe(result);
    for (const field of ["significator", "promissor", "contact", "geometry"] as const) {
      expect(again[field]).not.toBe(result[field]);
      expect(result[field]).not.toBe(input[field]);
    }
    for (const role of ["significator", "promissor"] as const) {
      expect(again.geometry[role]).not.toBe(result.geometry[role]);
      expect(again.geometry[role].position).not.toBe(result.geometry[role].position);
      expect(again.geometry[role].position.semiArcs).not.toBe(result.geometry[role].position.semiArcs);
    }
    Object.assign(input.geometry, { ramcDegrees: 0, trueObliquityDegrees: 23.5 });
    Object.assign(input.significator, { longitudeDegrees: 40 });
    Object.assign(input.promissor, { longitudeDegrees: 80 });
    Object.assign(input.contact, { branch: "sinister" });
    expect(JSON.stringify(result)).toBe(encoded);
    expect(() => Object.assign(result, { arcDegrees: 0 })).toThrow(TypeError);
    expect(() => Object.assign(result.contact, { branch: "sinister" })).toThrow(TypeError);
    expect(() => Object.assign(result.geometry.promissor, { longitudeDegrees: 0 })).toThrow(TypeError);
    expect(() => Object.assign(result.geometry.significator.position.semiArcs, { latitudeDegrees: 0 })).toThrow(TypeError);
  });
});
