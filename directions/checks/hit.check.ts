import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { hit, parseHit } from "../src/index.js";
import type { DirectionHit, HitInput, HitResult } from "../src/index.js";
import {
  HIT_EXAMPLES, HIT_FIXTURE_ARC_TOLERANCE_DEGREES,
  HIT_FIXTURE_TIMING_RELATIVE_TOLERANCE
} from "../evidence/hit-examples.js";
import type { HitExample } from "../evidence/hit-examples.js";

function request(example: HitExample): unknown {
  return {
    convention: {
      system: example.system, mode: example.mode, motion: example.motion,
      latitude: example.latitude, key: example.key,
      ...(example.motion === "converse" ? { converseConstruction: example.converseConstruction } : {})
    },
    geometry: example.geometry,
    significator: "angle" in example.significator
      ? { kind: "angle", angle: example.significator.angle }
      : { kind: "body", id: "Synthetic S", coordinates: example.significator },
    promissor: { kind: "body", id: "Synthetic P", coordinates: example.promissor },
    contact: example.contact, yearUnit: example.yearUnit,
    ...(example.solar ? { solar: example.solar } : {})
  };
}

function ok(result: HitResult): DirectionHit {
  expect(result.status, JSON.stringify(result)).toBe("ok");
  if (result.status !== "ok") throw new Error("Expected a complete hit");
  return result;
}

function frozen(value: unknown): void {
  expect(value).not.toBeInstanceOf(Date);
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(frozen);
  }
}

function numeric(actual: number, expected: number, tolerance: number): void {
  if (expected === 0) expect(actual).toBe(0);
  else expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

const base = {
  convention: { system: "placidus-semiarc", mode: "mundane", motion: "direct", latitude: "retain-both", key: "ptolemy" },
  geometry: { ramcDegrees: 0, latitudeDegrees: 0 },
  significator: { kind: "body", id: "Synthetic S", coordinates: { rightAscensionDegrees: 350, declinationDegrees: 0 } },
  promissor: { kind: "body", id: "Synthetic P", coordinates: { rightAscensionDegrees: 10, declinationDegrees: 0 } },
  contact: { kind: "conjunction" }, yearUnit: "tropical-365.2422-days"
} as const satisfies HitInput;

describe("complete independent hit examples", () => {
  for (const example of HIT_EXAMPLES) {
    it(example.id, () => {
      const result = ok(parseHit(request(example)));
      const expected = example.expected;
      expect(result.kind).toBe(expected.kind);
      numeric(result.arcDegrees, expected.arcDegrees, HIT_FIXTURE_ARC_TOLERANCE_DEGREES);
      numeric(result.geometry.calculation.geometry.targetHourAngleDegrees,
        expected.targetHourAngleDegrees, HIT_FIXTURE_ARC_TOLERANCE_DEGREES);
      const age = expected.directedAgeYears;
      const ageYears = age.numerator / age.denominator;
      const dayUnit = example.yearUnit === "tropical-365.2422-days"
        ? { numerator: 1826211, denominator: 5000 } : { numerator: 1461, denominator: 4 };
      const expectedDays = Number(BigInt(age.numerator) * BigInt(dayUnit.numerator))
        / Number(BigInt(age.denominator) * BigInt(dayUnit.denominator));
      numeric(result.directedAgeYears, ageYears, Math.abs(ageYears) * HIT_FIXTURE_TIMING_RELATIVE_TOLERANCE);
      numeric(result.timing.elapsedDays, expectedDays, Math.abs(expectedDays) * HIT_FIXTURE_TIMING_RELATIVE_TOLERANCE);
      const rate = expected.rateDegreesPerYear;
      expect(result.timing.rateDegreesPerYear).toBe(rate.numerator / rate.denominator);
      expect(result.arcDegrees).toBe(result.geometry.calculation.arcDegrees);
      expect(result.arcDegrees).toBe(result.timing.arcDegrees);
      expect(result.directedAgeYears).toBe(result.timing.directedAgeYears);
      expect(result.timing.key).toBe(result.convention.key);
      expect(result.timing.yearUnit).toBe(example.yearUnit);
      expect(result.contact).toEqual(example.contact);
      expect(result.promissor).toEqual({ kind: "body", id: "Synthetic P", coordinates: example.promissor });
      if (result.significator.kind === "body") expect(result.significator.id).toBe("Synthetic S");
      if (example.motion === "converse") {
        expect(result.convention).toMatchObject({ motion: "converse", converseConstruction: "placidus-role-swap" });
        expect(result.geometry.solver).toBe("mundane-body");
        if (result.geometry.solver === "mundane-body") {
          expect(result.geometry.calculation.geometry).toMatchObject({ movingRole: "significator", fixedRole: "promissor" });
        }
      }
      frozen(result);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });
  }

  it("uses zero latitude for zodiacal angular conjunctions while retaining the original input", () => {
    const result = ok(parseHit(request(HIT_EXAMPLES[8])));
    expect(result.geometry.solver).toBe("angle");
    if (result.geometry.solver !== "angle") throw new Error("Expected angle calculation");
    expect(result.promissor.coordinates).toEqual({ longitudeDegrees: 90, latitudeDegrees: -7 });
    expect(result.geometry.preparation).toBe("ecliptic-zero-latitude");
    expect(result.geometry.projection).toBe("@zodiacs/engine:eclipticToEquatorial");
    expect(result.geometry.trueObliquityDegrees).toBe(30);
    expect(result.geometry.preparedPromissor.rightAscensionDegrees).toBe(90);
    numeric(result.geometry.preparedPromissor.declinationDegrees, 30, HIT_FIXTURE_ARC_TOLERANCE_DEGREES);
  });

  it("does not change a geometry or its labels when the key or year unit changes", () => {
    const first = ok(hit(base));
    const second = ok(hit({ ...base, convention: { ...base.convention, key: "naibod" }, yearUnit: "julian-365.25-days" }));
    expect(first.geometry).toEqual(second.geometry);
    expect(first.significator).toEqual(second.significator);
    expect(first.arcDegrees).toBe(second.arcDegrees);
    expect(first.directedAgeYears).not.toBe(second.directedAgeYears);
    const unitOnly = ok(hit({ ...base, yearUnit: "julian-365.25-days" }));
    expect(unitOnly.directedAgeYears).toBe(first.directedAgeYears);
    expect(unitOnly.timing.elapsedDays).not.toBe(first.timing.elapsedDays);
  });

  it("keeps body-on-axis contacts as bodies and does not special-case Sun labels", () => {
    const input = { ...base, significator: { ...base.significator, coordinates: { rightAscensionDegrees: 0, declinationDegrees: 0 } } };
    const result = ok(hit(input));
    expect(result.kind).toBe("conjunction-to-body");
    expect(result.arcDegrees).toBe(10);
    const sun = ok(hit({ ...input, significator: { ...input.significator, id: "Sun" } }));
    expect(sun.geometry).toEqual(result.geometry);
    const sameBody = ok(hit({ ...base, significator: base.promissor }));
    expect(sameBody.arcDegrees).toBe(0);
    expect(sameBody.directedAgeYears).toBe(0);
  });
});

describe("hit refusals preserve scope and primitive codes", () => {
  it("refuses angle aspects and traditional converse angles without an angle-as-body substitution", () => {
    for (const angle of ["mc", "ic", "asc", "dsc"] as const) {
      const angular = { ...base, significator: { kind: "angle", angle } } as const;
      expect(hit({ ...angular, contact: { kind: "aspect", aspect: "opposition" } })).toMatchObject({
        status: "refused", stage: "angle", code: "unsupported-angle-aspect"
      });
      expect(hit({ ...angular, convention: { ...base.convention, motion: "converse", converseConstruction: "placidus-role-swap" } })).toMatchObject({
        status: "refused", stage: "angle", code: "unsupported-converse-angle"
      });
    }
    const zodiacal = request(HIT_EXAMPLES[8]) as Record<string, unknown>;
    expect(parseHit({ ...zodiacal, contact: { kind: "aspect", aspect: "square", branch: "dexter" } })).toMatchObject({
      status: "refused", stage: "angle", code: "unsupported-angle-aspect"
    });
  });

  it("preserves zodiacal converse and sphere-domain refusals", () => {
    const zodiacal = request(HIT_EXAMPLES[0]) as Record<string, unknown>;
    expect(parseHit({ ...zodiacal, convention: { ...(zodiacal.convention as object), motion: "converse", converseConstruction: "placidus-role-swap" } })).toMatchObject({
      status: "refused", stage: "zodiacal", code: "unsupported-converse-zodiacal"
    });
    expect(hit({ ...base, geometry: { ramcDegrees: 0, latitudeDegrees: 90 } })).toMatchObject({
      status: "refused", stage: "sphere", code: "geographic-pole"
    });
    expect(hit({ ...base, geometry: { ramcDegrees: 0, latitudeDegrees: 60 },
      promissor: { ...base.promissor, coordinates: { rightAscensionDegrees: 10, declinationDegrees: 60 } } })).toMatchObject({
      status: "refused", stage: "sphere", code: "circumpolar-above"
    });
    expect(hit({ ...base, significator: { kind: "angle", angle: "mc" },
      promissor: { ...base.promissor, coordinates: { rightAscensionDegrees: 0, declinationDegrees: 0 } },
      geometry: { ramcDegrees: Number.MIN_VALUE, latitudeDegrees: 0 } })).toMatchObject({
      status: "refused", stage: "angle", code: "numerical-degeneracy"
    });
  });

  it("validates solar timing on zero arcs and retains the timing failure stage", () => {
    const solar = HIT_EXAMPLES[2].solar;
    const input = { ...base, convention: { ...base.convention, key: "solar-equatorial-birth-day" }, solar } as const;
    expect(hit({ ...input, solar: { ...solar, end: { ...solar.end, jdTt: solar.start.jdTt + 2 } } })).toMatchObject({
      status: "refused", stage: "timing", code: "invalid-solar-interval"
    });
    expect(hit({ ...input, significator: base.promissor, solar: { ...solar, end: { ...solar.end, rightAscensionDegrees: solar.start.rightAscensionDegrees } } })).toMatchObject({
      status: "refused", stage: "timing", code: "invalid-solar-motion"
    });
    expect(hit({ ...input, solar: { ...solar, start: { ...solar.start, rightAscensionDegrees: 0 },
      end: { ...solar.end, rightAscensionDegrees: Number.MIN_VALUE } } })).toMatchObject({
      status: "refused", stage: "timing", code: "numerical-degeneracy"
    });
  });

  it("never defaults or ignores supplied choices", () => {
    for (const field of Object.keys(base)) {
      const input: Record<string, unknown> = { ...base };
      delete input[field];
      expect(parseHit(input).status).toBe("refused");
    }
    for (const change of [
      { convention: { ...base.convention, key: undefined } },
      { convention: { ...base.convention, latitude: "zero-both" } },
      { convention: { ...base.convention, motion: "converse" } },
      { convention: { ...base.convention, system: "regiomontanus" } },
      { solar: undefined }, { yearUnit: undefined }, { key: "naibod" }, { motion: "converse" },
      { geometry: { ...base.geometry, trueObliquityDegrees: 23.5 } },
      { geometry: { ramcDegrees: 360, latitudeDegrees: 0 } },
      { promissor: { ...base.promissor, coordinates: { longitudeDegrees: 0, latitudeDegrees: 0 } } },
      { promissor: { ...base.promissor, id: " Synthetic P" } },
      { promissor: { ...base.promissor, id: "" } },
      { significator: { kind: "angle", angle: "mc", coordinates: base.promissor.coordinates } },
      { contact: { kind: "aspect", aspect: "square", branch: "dexter" } },
      { contact: { kind: "aspect", aspect: "square" } },
      { contact: { kind: "conjunction", branch: "westward" } },
      { contact: { kind: "aspect", aspect: "opposition", branch: "westward" } }
    ]) {
      const result = parseHit({ ...base, ...change });
      expect(result.status, JSON.stringify(change)).toBe("refused");
      frozen(result);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
      expect(result).not.toHaveProperty("arcDegrees");
      expect(result).not.toHaveProperty("directedAgeYears");
    }
    expect(parseHit({ ...base, promissor: { ...base.promissor, id: base.significator.id } })).toMatchObject({
      status: "refused", stage: "input", code: "inconsistent-body"
    });
  });

  it("rejects non-data input at every consumed layer without invoking getters", () => {
    for (const value of [undefined, null, [], true, 12, "hit", new Date(0), Object.create(base)]) {
      expect(parseHit(value)).toMatchObject({ status: "refused", stage: "input", code: "invalid-input" });
    }
    expect(parseHit(Object.assign(Object.create(null), base))).toEqual(hit(base));
    const paths = [[], ["convention"], ["geometry"], ["significator"], ["significator", "coordinates"], ["contact"]];
    let calls = 0;
    for (const path of paths) {
      for (const mode of ["accessor", "hidden", "symbol"] as const) {
        const input = structuredClone(base) as unknown as Record<string, unknown>;
        let target = input;
        for (const key of path) target = target[key] as Record<string, unknown>;
        const key = Object.keys(target)[0]!;
        if (mode === "accessor") Object.defineProperty(target, key, { get() { calls++; return 0; } });
        else if (mode === "hidden") Object.defineProperty(target, key, { enumerable: false });
        else target[Symbol("extra") as unknown as string] = 0;
        expect(parseHit(input).status).toBe("refused");
      }
    }
    expect(calls).toBe(0);
  });

  it("lets unexpected executable input failures propagate instead of disguising them as a mathematical refusal", () => {
    const sentinel = new Error("unexpected trap");
    const input = new Proxy({}, { getPrototypeOf() { throw sentinel; } });
    expect(() => parseHit(input)).toThrow(sentinel);
  });
});

it("detaches all result data without freezing caller input", () => {
  const input = structuredClone(request(HIT_EXAMPLES[2])) as Record<string, unknown>;
  const before = JSON.stringify(input);
  const result = ok(parseHit(input));
  expect(JSON.stringify(input)).toBe(before);
  const encoded = JSON.stringify(result);
  function mutate(value: unknown): void {
    if (value !== null && typeof value === "object") {
      expect(Object.isFrozen(value)).toBe(false);
      Object.values(value).forEach(mutate);
      Object.assign(value, { changed: true });
    }
  }
  mutate(input);
  expect(JSON.stringify(result)).toBe(encoded);
  frozen(result);
  expect(() => Object.assign(result.promissor.coordinates, { latitudeDegrees: 0 })).toThrow(TypeError);
  expect(result).toEqual(parseHit(JSON.parse(before)));
});

it("the public pure import graph contains no ephemeris, adapter, I/O or external runtime import", () => {
  const visited = new Set<string>();
  const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url));
  const forbidden = /(?:astronomy|\/natal\.ts$|\/solar\.ts$|\/calc\.ts$|\/full\.ts$)/;
  function visit(file: string): void {
    if (visited.has(file)) return;
    expect(file).not.toMatch(forbidden);
    visited.add(file);
    const parsed = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ESNext, true);
    for (const statement of parsed.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      const typeOnly = ts.isImportDeclaration(statement) ? statement.importClause?.isTypeOnly : statement.isTypeOnly;
      if (typeOnly || !statement.moduleSpecifier) continue;
      expect(ts.isStringLiteral(statement.moduleSpecifier)).toBe(true);
      const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
      expect(specifier.startsWith(".")).toBe(true);
      visit(resolve(dirname(file), specifier.replace(/\.js$/, ".ts")));
    }
  }
  visit(entry);
  expect([...visited].some(file => file.endsWith("/hit.ts"))).toBe(true);
});
