import { afterEach, describe, expect, it, vi } from "vitest";
import * as engine from "../../src/index.js";
import type { BirthInput } from "../../src/index.js";
import {
  createNatalEnvelope, natalReplayInput, parseNatalEnvelope, serializeNatalEnvelope,
  NatalEnvelopeError
} from "../../src/receipt.js";
import {
  castNatal, compareNatal, draconicChart, draconicCompare, transformNatal
} from "../src/index.js";
import type { DraconicOptions, NatalEnvelopeContext } from "../src/index.js";

// Invented instant and sites. These tests check integration and preservation,
// not independent astronomical accuracy. Rotation arithmetic is checked in
// transform.test.ts and compare.test.ts against test/ARITHMETIC.md.
const birth = {
  utc: "2000-04-05T06:07:00Z", latitude: 12.5, longitude: 45.25, houseSystem: "equal"
} satisfies BirthInput;

const operations = [
  { name: "chart", run: draconicChart },
  { name: "compare", run: draconicCompare }
] as const;

afterEach(() => vi.restoreAllMocks());

describe.each(operations)("$name result with natal receipt", ({ run }) => {
  it.each(["true", "mean"] as const)("keeps the %s node derivation outside an unchanged engine envelope", (node) => {
    const source = castNatal(birth, { node });
    const result = run(birth, { node });
    const expected = createNatalEnvelope(source.natal);
    expect(result.natal).toEqual(expected);
    expect(serializeNatalEnvelope(result.natal)).toBe(serializeNatalEnvelope(expected));
    expect(parseNatalEnvelope(JSON.stringify(result.natal))).toEqual({ ok: true, envelope: expected });
    // This library's result wrapper is deliberately not an engine envelope.
    expect(result).not.toHaveProperty("schema");
    expect(result.natal.receipt.conventions.zodiac).toBe("tropical");
    expect(result.natal.receipt.engine).toEqual({
      name: "@zodiacs/engine", version: source.natal.engineVersion, ephemeris: engine.EPHEMERIS
    });
    expect(result.conventions).toEqual({
      schema: "zodiacs.draconic-conventions.draft-v1",
      sourceZodiac: "tropical", units: "degrees", longitudeRange: "[0, 360)",
      northNode: source.node, northNodeTargetLongitude: 0,
      rotation: "subtract-natal-north-node-longitude;wrap-to-[0,360)",
      arithmetic: "binary64;positive-zero;rounded-360-to-zero",
      houses: "rotate-existing-natal-cusps;preserve-order-and-computed-system;no-recast",
      latitude: "unchanged", motion: "position-snapshot;no-derived-speeds",
      receiptScope: "engine-natal-only;draconic-derived-by-this-library"
    });
    if ("draconic" in result) {
      expect(result.draconic).toEqual(transformNatal(source));
      expect(result.draconic).not.toHaveProperty("receipt");
    } else {
      expect(result.comparison).toEqual(compareNatal(source));
      expect(result.comparison).not.toHaveProperty("receipt");
    }
    const replay = castNatal(natalReplayInput(result.natal), { node });
    expect(transformNatal(replay)).toEqual(transformNatal(source));
    expect(compareNatal(replay)).toEqual(compareNatal(source));
  });

  it("defaults to true node and casts exactly once per result", () => {
    const cast = vi.spyOn(engine, "natalChart");
    const points = vi.spyOn(engine, "chartPoints");
    const result = run(birth);
    expect(cast).toHaveBeenCalledTimes(1);
    expect(points).not.toHaveBeenCalled();
    expect(result.conventions.northNode).toMatchObject({ kind: "true", enginePoint: "North Node" });
    cast.mockClear();
    run(birth, { node: "mean" });
    expect(cast).toHaveBeenCalledTimes(1);
    expect(points).toHaveBeenCalledTimes(1);
  });

  it.each([
    { timeScale: "utc" }, { timeScale: "ut1" }, { timeScale: "tt" },
    { timeScale: "utc", deltaT: 120.5 }, { timeScale: "ut1", deltaT: 120.5 },
    { timeScale: "tt", deltaT: 120.5 },
    { utc: "1850-04-05T06:07:00Z" }, { utc: "2300-04-05T06:07:00Z" }
  ] satisfies Partial<BirthInput>[])("preserves the engine clock and deltaT for %j", (settings) => {
    for (const node of ["true", "mean"] as const) {
      const input = { ...birth, ...settings };
      const result = run(input, { node });
      const natal = castNatal(input).natal;
      expect(result.natal).toEqual(createNatalEnvelope(natal));
      expect(result.natal.receipt.timeScale).toBe(natal.timeScale.input);
      expect(result.natal.result.timeScale).toEqual(natal.timeScale);
      expect(result.natal.result.deltaT).toEqual(natal.deltaT);
      expect(result.natal.receipt.resultFlags).toEqual(natal.flags);
    }
  });

  it.each([
    { utc: birth.utc, houseSystem: "placidus" },
    { ...birth, timeKnown: false, flags: ["lmt", "no-time", "lmt"] },
    { ...birth, latitude: 78.5, houseSystem: "placidus" },
    { ...birth, latitude: -78.5, houseSystem: "koch" }
  ] satisfies BirthInput[])("preserves absent geometry or actual fallback houses for %j", (input) => {
    for (const node of ["true", "mean"] as const) {
      const source = castNatal(input, { node });
      const result = run(input, { node });
      expect(result.natal).toEqual(createNatalEnvelope(source.natal));
      expect(result.natal.receipt.houses.requested).toBe(input.houseSystem);
      expect(result.natal.receipt.houses.actual).toBe(source.natal.houses?.system ?? null);
      expect(result.natal.receipt.resultFlags).toEqual(source.natal.flags);
      const derived = "draconic" in result ? result.draconic : result.comparison;
      expect(derived.houses?.system ?? null).toBe(source.natal.houses?.system ?? null);
      expect(derived.angles === null).toBe(source.natal.angles === null);
      expect(derived.houses === null).toBe(source.natal.houses === null);
    }
  });

  it("retains explicit source spelling, local context and claimed provenance without adding facts", () => {
    const input = { ...birth, utc: "2000-04-05T08:07:00+02:00" };
    const context: NatalEnvelopeContext = {
      sourceInstant: input.utc,
      localResolution: {
        date: "2000-04-05", time: "08:07", timeZone: "Etc/GMT-2",
        offsetMinutes: 120, gapShiftMinutes: 0,
        policy: { fold: "earlier", gap: "shift-forward" },
        calendar: "gregorian", writtenDate: "2000-04-05", tzdbVersion: null,
        dataForm: "host", clock: "legal", transition: null, localMeanTime: null
      },
      provenance: { runtime: { name: "synthetic-test-runtime", version: "test" } },
      extensions: { synthetic: { label: "invented-context" } }
    };
    const before = structuredClone(context);
    const result = run(input, { node: "mean" }, context);
    expect(context).toEqual(before);
    expect(result.natal).toEqual(createNatalEnvelope(castNatal(input).natal, context));
    expect(result.natal.receipt.instant).toBe("2000-04-05T06:07:00.000Z");
    expect(result.natal.receipt.sourceInstant).toBe(input.utc);
    expect(result.natal.receipt.localResolution).toEqual(context.localResolution);
    expect(result.natal.receipt.provenance).toEqual({ ...context.provenance, status: "claimed" });
    expect(result.natal.receipt.provenance).not.toHaveProperty("artifact");
    expect(result.natal.extensions).toEqual(context.extensions);
    const withoutContext = run(input);
    expect(withoutContext.natal.receipt.sourceInstant).toBeNull();
    expect(withoutContext.natal.receipt.localResolution).toBeNull();
    expect(withoutContext.natal.receipt.provenance).toBeNull();
  });

  it("does not infer a noon reference for unknown time", () => {
    const result = run({ ...birth, timeKnown: false });
    expect(result.natal.receipt.reference).toBe("supplied-instant");
    expect(result.natal.receipt.instant).toBe("2000-04-05T06:07:00.000Z");
    expect(result.natal.receipt.houses.absenceReason).toBe("unknown-time");
  });

  it("isolates input, context, natal data, derived data and metadata from each other and later calls", () => {
    const input = { ...birth, utc: new Date(birth.utc), flags: ["lmt"] } satisfies BirthInput;
    const context: NatalEnvelopeContext = {
      provenance: { runtime: { name: "synthetic-runtime" } }, extensions: { labels: ["synthetic"] }
    };
    const result = run(input, { node: "mean" }, context);
    const before = structuredClone(result);
    input.utc.setUTCFullYear(2010);
    input.flags.push("lmt");
    context.provenance!.runtime!.name = "changed";
    (context.extensions!.labels as string[]).push("changed");
    expect(result).toEqual(before);

    const independent = run({ ...birth, flags: ["lmt"] }, { node: "mean" }, {
      provenance: { runtime: { name: "synthetic-runtime" } }, extensions: { labels: ["synthetic"] }
    });
    const derived = "draconic" in result ? result.draconic : result.comparison;
    result.conventions.northNode.longitude = 1;
    expect(derived.node.longitude).toBe(before.conventions.northNode.longitude);
    result.natal.result.bodies[0]!.lon = 1;
    result.natal.result.angles!.asc = 1;
    result.natal.result.houses!.cusps[0] = 1;
    const expectedDerived = "draconic" in before ? before.draconic : before.comparison;
    expect(derived).toEqual(expectedDerived);
    derived.node.longitude = 2;
    result.natal.receipt.resultFlags.push("dst-fold");
    expect(independent).toEqual(before);
  });

  it.each([
    { sourceInstant: "2001-04-05T06:07:00Z" },
    { reference: "utc-noon" },
    { provenance: { artifact: { sha256: "invalid", packageVersion: "1.0.0" } } },
    { provenance: {} }, { unexpected: true }, null, []
  ])("propagates engine context rejection for %j", (context) => {
    expect(() => run(birth, {}, context as NatalEnvelopeContext)).toThrow(NatalEnvelopeError);
  });

  it("propagates invalid birth and node selection errors", () => {
    expect(() => run({ ...birth, utc: "2000-02-30" })).toThrow(RangeError);
    expect(() => run(birth, { node: "south" } as unknown as DraconicOptions)).toThrow(RangeError);
  });
});
