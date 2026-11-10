import { describe, expect, it } from "vitest";
import { mundaneBodyArc, MundaneDirectionError, SphereGeometryError } from "../src/index.js";
import type {
  MundaneBodyInput, MundaneContact, MundaneDirectionErrorCode, SphereGeometryErrorCode
} from "../src/index.js";
import { prepareNatal } from "../src/natal.js";

const base = {
  system: "placidus-semiarc", mode: "mundane", latitude: "retain-both", motion: "direct",
  geometry: { ramcDegrees: 150, latitudeDegrees: 35 },
  significator: { rightAscensionDegrees: 30, declinationDegrees: 4 },
  promissor: { rightAscensionDegrees: 70, declinationDegrees: -3 },
  contact: { kind: "conjunction" }
} as const satisfies MundaneBodyInput;

const contacts = [
  { kind: "conjunction" }, { kind: "aspect", aspect: "opposition" },
  ...(["sextile", "square", "trine"] as const).flatMap(aspect =>
    (["westward", "eastward"] as const).map(branch => ({ kind: "aspect" as const, aspect, branch })))
] as const satisfies readonly MundaneContact[];

const motions = [
  { motion: "direct" }, { motion: "converse", converseConstruction: "placidus-role-swap" }
] as const;

function refused(input: unknown, code: MundaneDirectionErrorCode = "invalid-input"): void {
  let caught: unknown;
  try { mundaneBodyArc(input as MundaneBodyInput); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(MundaneDirectionError);
  expect(caught).toBeInstanceOf(RangeError);
  expect(caught).toMatchObject({ name: "MundaneDirectionError", code });
}

function sphereRefused(input: unknown, code: SphereGeometryErrorCode): void {
  let caught: unknown;
  try { mundaneBodyArc(input as MundaneBodyInput); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(SphereGeometryError);
  expect(caught).not.toBeInstanceOf(MundaneDirectionError);
  expect(caught).toMatchObject({ name: "SphereGeometryError", code });
}

function frozenData(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const entry of Object.values(value)) frozenData(entry);
  }
}

describe("mundane explicit convention and input contract", () => {
  it("requires every field and refuses unknown, inherited and non-data records", () => {
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
    refused({ ...base, geometry: { ...base.geometry, trueObliquityDegrees: 23.5 } });
    refused({ ...base, significator: { longitudeDegrees: 30, latitudeDegrees: 4 } });
    refused({ ...base, promissor: { longitudeDegrees: 70, latitudeDegrees: -3 } });
  });

  it("never reads accessor properties at any input depth", () => {
    let reads = 0;
    const records = { root: base, geometry: base.geometry, significator: base.significator,
      promissor: base.promissor, contact: { kind: "aspect", aspect: "square", branch: "westward" } };
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

  it("refuses omitted, unsupported or mixed conventions without a default", () => {
    for (const [field, values] of Object.entries({
      system: [undefined, null, "placidus", "regiomontanus", 0],
      mode: [undefined, null, "zodiacal", "Mundane", false],
      latitude: [undefined, null, "zero-both", "zero-promissor", "zero-significator", false],
      motion: [undefined, null, "Direct", "reverse", true]
    })) for (const value of values) refused({ ...base, [field]: value });
    for (const contact of contacts) {
      refused({ ...base, contact, motion: "converse" });
      for (const converseConstruction of [undefined, null, "reverse-rotation", "placidus-direct"]) {
        refused({ ...base, contact, motion: "converse", converseConstruction });
      }
      for (const converseConstruction of [undefined, "placidus-role-swap"]) {
        refused({ ...base, contact, converseConstruction });
      }
    }
  });

  it("requires geometric branch names and forbids meaningless branches", () => {
    for (const contact of [
      { kind: "conjunction", branch: "westward" }, { kind: "conjunction", aspect: "conjunction" },
      { kind: "aspect" }, { kind: "aspect", aspect: "conjunction" },
      { kind: "aspect", aspect: "quintile", branch: "westward" },
      { kind: "aspect", aspect: "opposition", branch: "eastward" },
      { kind: "aspect", aspect: "opposition", branch: undefined },
      { kind: "parallel" }, { kind: undefined }, { kind: null }
    ]) for (const motion of motions) refused({ ...base, ...motion, contact });
    for (const aspect of ["sextile", "square", "trine"]) {
      for (const motion of motions) {
        refused({ ...base, ...motion, contact: { kind: "aspect", aspect } });
        for (const branch of [undefined, null, "left", "dexter", "sinister", "Westward", false]) {
          refused({ ...base, ...motion, contact: { kind: "aspect", aspect, branch } });
        }
      }
    }
  });

  it("validates finite canonical coordinates for both roles before geometry", () => {
    for (const [name, record] of Object.entries({ geometry: base.geometry,
      significator: base.significator, promissor: base.promissor })) {
      for (const field of Object.keys(record)) {
        for (const value of [undefined, null, "0", false, NaN, Infinity, -Infinity]) {
          refused({ ...base, [name]: { ...record, [field]: value } });
        }
        const invalidRange = field === "latitudeDegrees" || field === "declinationDegrees"
          ? [-90.001, 90.001] : [-0.001, 360];
        for (const value of invalidRange) refused({ ...base, [name]: { ...record, [field]: value } });
      }
    }
  });

  it("accepts frozen and null-prototype plain records for both motions", () => {
    for (const motion of motions) {
      const normal = mundaneBodyArc({ ...base, ...motion });
      const input = Object.assign(Object.create(null), base, motion, {
        geometry: Object.assign(Object.create(null), base.geometry),
        significator: Object.assign(Object.create(null), base.significator),
        promissor: Object.assign(Object.create(null), base.promissor),
        contact: Object.assign(Object.create(null), base.contact)
      });
      expect(mundaneBodyArc(input)).toEqual(normal);
      Object.values(input).forEach(value => { if (typeof value === "object" && value !== null) Object.freeze(value); });
      expect(mundaneBodyArc(Object.freeze(input))).toEqual(normal);
    }
  });
});

describe("mundane branch orientation and result contract", () => {
  it("retains the original promissor-to-significator branch when converse exchanges roles", () => {
    // Both declinations vanish, hence D=N=90 and q is the west-positive
    // hour angle modulo a turn. At S=10, P=20, the direct arc is 10-offset
    // and the converse arc is -10+offset, each reduced to the first turn.
    // These exact integer expectations come from that equatorial identity.
    const cases: readonly { contact: MundaneContact; offset: number; direct: number; converse: number }[] = [
      { contact: { kind: "conjunction" }, offset: 0, direct: 10, converse: 350 },
      { contact: { kind: "aspect", aspect: "opposition" }, offset: 180, direct: 190, converse: 170 },
      { contact: { kind: "aspect", aspect: "sextile", branch: "westward" }, offset: 60, direct: 310, converse: 50 },
      { contact: { kind: "aspect", aspect: "sextile", branch: "eastward" }, offset: -60, direct: 70, converse: 290 },
      { contact: { kind: "aspect", aspect: "square", branch: "westward" }, offset: 90, direct: 280, converse: 80 },
      { contact: { kind: "aspect", aspect: "square", branch: "eastward" }, offset: -90, direct: 100, converse: 260 },
      { contact: { kind: "aspect", aspect: "trine", branch: "westward" }, offset: 120, direct: 250, converse: 110 },
      { contact: { kind: "aspect", aspect: "trine", branch: "eastward" }, offset: -120, direct: 130, converse: 230 }
    ];
    for (const fixture of cases) for (const motion of motions) {
      const input: MundaneBodyInput = { ...base, ...motion,
        significator: { rightAscensionDegrees: 10, declinationDegrees: 0 },
        promissor: { rightAscensionDegrees: 20, declinationDegrees: 0 }, contact: fixture.contact };
      const result = mundaneBodyArc(input);
      const direct = motion.motion === "direct";
      expect(result.arcDegrees).toBe(fixture[motion.motion]);
      expect(result).toMatchObject({
        system: "placidus-semiarc", mode: "mundane", latitude: "retain-both", motion: motion.motion,
        kind: fixture.contact.kind === "conjunction" ? "conjunction-to-body" : "aspect-to-body",
        construction: direct ? "placidus-direct" : "placidus-role-swap",
        significator: input.significator, promissor: input.promissor, contact: fixture.contact
      });
      expect(result.geometry).toMatchObject({
        ...input.geometry, movingRole: direct ? "promissor" : "significator",
        fixedRole: direct ? "significator" : "promissor", rotation: "westward",
        aspectOffsetDegrees: fixture.offset,
        targetOffsetDegrees: fixture.offset === 0 ? 0 : direct ? -fixture.offset : fixture.offset,
        positionDefinition: "placidus-proportional-semiarc", branchReference: "original-promissor-to-significator"
      });
    }
  });

  it("returns exact positive zero for identical bodily points in either construction", () => {
    for (const motion of motions) for (const rightAscensionDegrees of [0, 0.1, 65.4321, 180, 359.9]) {
      const result = mundaneBodyArc({ ...base, ...motion,
        significator: { rightAscensionDegrees, declinationDegrees: 11 },
        promissor: { rightAscensionDegrees, declinationDegrees: 11 } });
      expect(Object.is(result.arcDegrees, 0)).toBe(true);
      expect(result.geometry).toMatchObject({ coincident: true, unreducedArcDegrees: 0, wholeTurnsAdded: 0 });
    }
  });

  it("preserves engine bodily equatorial rows and natal geometry (integration only)", () => {
    const natal = prepareNatal({
      utc: "2000-01-01T12:00:00Z", timeScale: "ut1", timeKnown: true,
      latitude: 35, longitude: 15, houseSystem: "placidus", deltaT: 64
    });
    const before = JSON.stringify(natal);
    const sun = natal.equatorial.rows.find(row => row.body === "Sun");
    const moon = natal.equatorial.rows.find(row => row.body === "Moon");
    if (!sun || !moon || sun.ra === null || moon.ra === null) {
      throw new Error("Synthetic chart needs defined Sun and Moon right ascensions");
    }
    for (const motion of motions) {
      const result = mundaneBodyArc({ ...base, ...motion,
        geometry: { ramcDegrees: natal.geometry.ramcDegrees, latitudeDegrees: natal.geometry.latitudeDegrees },
        significator: { rightAscensionDegrees: sun.ra, declinationDegrees: sun.dec },
        promissor: { rightAscensionDegrees: moon.ra, declinationDegrees: moon.dec }
      });
      expect(result.geometry).toMatchObject({
        ramcDegrees: natal.geometry.ramcDegrees, latitudeDegrees: natal.geometry.latitudeDegrees
      });
      for (const [role, row] of [["significator", sun], ["promissor", moon]] as const) {
        expect(result[role]).toEqual({ rightAscensionDegrees: row.ra, declinationDegrees: row.dec });
        expect(result.geometry[role]).toMatchObject({
          ramcDegrees: natal.geometry.ramcDegrees, rightAscensionDegrees: row.ra,
          semiArcs: { latitudeDegrees: natal.geometry.latitudeDegrees, declinationDegrees: row.dec }
        });
      }
    }
    // This verifies value flow, never an independent ephemeris or arc value.
    expect(JSON.stringify(natal)).toBe(before);
    expect(natal.chart.houses.system).toBe("placidus");
    expect(natal.chart.timeScale.input).toBe("ut1");
    expect(natal.provenance.equatorial).toBe("@zodiacs/engine:chartDeclinations");
  });

  it("returns fresh deeply frozen data without mutating, retaining or freezing caller data", () => {
    for (const motion of motions) {
      const input: MundaneBodyInput = { ...base, ...motion, geometry: { ...base.geometry },
        significator: { ...base.significator }, promissor: { ...base.promissor },
        contact: { kind: "aspect", aspect: "square", branch: "westward" } };
      const before = JSON.stringify(input);
      const result = mundaneBodyArc(input);
      const encoded = JSON.stringify(result);
      const again = mundaneBodyArc(input);
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
        expect(again.geometry[role].semiArcs).not.toBe(result.geometry[role].semiArcs);
      }
      Object.assign(input.geometry, { ramcDegrees: 0 });
      Object.assign(input.significator, { rightAscensionDegrees: 40 });
      Object.assign(input.promissor, { declinationDegrees: 20 });
      Object.assign(input.contact, { branch: "eastward" });
      expect(JSON.stringify(result)).toBe(encoded);
      expect(() => Object.assign(result, { arcDegrees: 0 })).toThrow(TypeError);
      expect(() => Object.assign(result.contact, { branch: "eastward" })).toThrow(TypeError);
      expect(() => Object.assign(result.geometry.promissor, { rightAscensionDegrees: 0 })).toThrow(TypeError);
      expect(() => Object.assign(result.geometry.significator.semiArcs, { latitudeDegrees: 0 })).toThrow(TypeError);
    }
  });
});

describe("mundane undefined sphere geometry", () => {
  it("propagates poles, tangencies and circumpolar refusals for either body in both motions", () => {
    for (const motion of motions) {
      for (const latitudeDegrees of [-90, 90]) {
        sphereRefused({ ...base, ...motion, geometry: { ...base.geometry, latitudeDegrees } }, "geographic-pole");
      }
      for (const role of ["significator", "promissor"]) {
        for (const declinationDegrees of [-90, 90]) {
          sphereRefused({ ...base, ...motion, [role]: { rightAscensionDegrees: 0, declinationDegrees } }, "celestial-pole");
        }
        for (const latitudeDegrees of [-60, 60]) for (const declinationDegrees of [-45, -30, 30, 45]) {
          const code = Math.abs(declinationDegrees) === 30 ? "horizon-tangency"
            : Math.sign(latitudeDegrees) === Math.sign(declinationDegrees) ? "circumpolar-above" : "circumpolar-below";
          sphereRefused({ ...base, ...motion, geometry: { ramcDegrees: 0, latitudeDegrees },
            [role]: { rightAscensionDegrees: 0, declinationDegrees } }, code);
        }
      }
    }
  });
});
