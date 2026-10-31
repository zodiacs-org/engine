import { afterEach, describe, expect, it, vi } from "vitest";
import * as engine from "../../src/index.js";
import type { BirthInput } from "../../src/index.js";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "../../src/receipt.js";
import {
  castNatal, compareNatal, draconicChart, draconicCompare, transformNatal
} from "../src/index.js";
import type { DraconicSource, NatalEnvelopeContext } from "../src/index.js";

// Invented input. Engine comparisons below establish wiring and preservation,
// not physical accuracy. Independent arithmetic stays in ARITHMETIC.md.
const birth = {
  utc: "2000-04-05T06:07:00Z", latitude: 12.5, longitude: 45.25
} satisfies BirthInput;

function freeze(value: object): void {
  Object.values(value).forEach((child: unknown) => {
    if (child !== null && typeof child === "object") freeze(child);
  });
  Object.freeze(value);
}

afterEach(() => vi.restoreAllMocks());

describe.each([
  { name: "transformNatal", derive: transformNatal }, { name: "compareNatal", derive: compareNatal }
])("pure snapshot audit: $name", ({ derive }) => {
  it.each(["true", "mean"] as const)("omits undeclared %s node metadata without reading it", (kind) => {
    const node = kind === "true"
      ? { kind, enginePoint: "North Node" as const, longitude: 75.25 }
      : { kind, enginePoint: "Mean Node" as const, longitude: 75.25 };
    const extra = { nested: ["caller-owned"] };
    Object.assign(node, { extra });
    Object.defineProperty(node, "unrelated", {
      enumerable: true, get: () => { throw new Error("Undeclared field was read"); }
    });
    const source: DraconicSource = { node, natal: { bodies: [], angles: null, houses: null } };
    const output = derive(source);
    expect(output.node).toEqual({ kind, enginePoint: node.enginePoint, longitude: 75.25 });
    expect(output.node === node).toBe(false);
    expect(output.node).not.toHaveProperty("extra");
    expect(output.node).not.toHaveProperty("unrelated");
    expect(extra.nested).toEqual(["caller-owned"]);
  });

  it("does not cast or select nodes when reading a frozen existing source", () => {
    const source = castNatal(birth);
    const before = structuredClone(source);
    freeze(source);
    const cast = vi.spyOn(engine, "natalChart");
    const points = vi.spyOn(engine, "chartPoints");
    derive(source);
    expect(cast).not.toHaveBeenCalled();
    expect(points).not.toHaveBeenCalled();
    expect(source).toEqual(before);
  });
});

describe("selected-node boundary audit", () => {
  it.each([undefined, NaN, Infinity, -1, 360])("refuses invalid true-node longitude %s without substituting a mean node", (longitude) => {
    const natal = engine.natalChart(birth);
    const rows = natal.bodies.filter((row) => row.body !== "North Node");
    if (longitude !== undefined) rows.push({ ...natal.bodies[0]!, body: "North Node", lon: longitude });
    vi.spyOn(engine, "natalChart").mockReturnValue({ ...natal, bodies: rows });
    const points = vi.spyOn(engine, "chartPoints");
    expect(() => castNatal(birth)).toThrow(/valid north-node longitude/);
    expect(points).not.toHaveBeenCalled();
  });

  it.each([undefined, NaN, Infinity, -1, 360])("refuses invalid mean-node longitude %s without substituting the true node", (longitude) => {
    const points = engine.chartPoints(engine.natalChart(birth));
    const rows = points.points.filter((row) => row.point !== "Mean Node");
    if (longitude !== undefined) rows.push({ ...points.points[0]!, point: "Mean Node", lon: longitude });
    vi.spyOn(engine, "chartPoints").mockReturnValue({ ...points, points: rows });
    expect(() => castNatal(birth, { node: "mean" })).toThrow(/valid north-node longitude/);
  });

  it("rejects invalid options before invoking the engine", () => {
    const cast = vi.spyOn(engine, "natalChart");
    expect(() => castNatal(birth, { extra: true } as never)).toThrow(RangeError);
    expect(cast).not.toHaveBeenCalled();
  });
});

describe.each([
  { name: "draconicChart", calculate: draconicChart }, { name: "draconicCompare", calculate: draconicCompare }
])("receipt-bearing audit: $name", ({ calculate }) => {
  it.each(engine.HOUSE_SYSTEMS)("preserves %s natal construction and receipt with either node", (houseSystem) => {
    for (const node of ["true", "mean"] as const) {
      const input = { ...birth, houseSystem };
      const result = calculate(input, { node });
      const source = castNatal(input, { node });
      expect(result.natal).toEqual(createNatalEnvelope(source.natal));
      expect(parseNatalEnvelope(serializeNatalEnvelope(result.natal)).ok).toBe(true);
      const derived = "draconic" in result ? result.draconic : result.comparison;
      expect(derived.houses?.system).toBe(source.natal.houses!.system);
      // Wiring only: reuse the same engine cusps and pure transform.
      const rotated = transformNatal(source).houses!.cusps;
      const cusps = "draconic" in result ? result.draconic.houses!.cusps
        : result.comparison.houses!.cusps.map((row) => row.draconicLongitude);
      expect(cusps).toEqual(rotated);
    }
  });

  it("accepts frozen birth, options and receipt context without sharing nested claims", () => {
    const input = { ...birth, flags: ["lmt"] } satisfies BirthInput;
    const options = { node: "mean" as const };
    const context: NatalEnvelopeContext = {
      sourceInstant: birth.utc, extensions: { synthetic: { labels: ["invented"] } },
      provenance: { runtime: { name: "synthetic-runtime" } }
    };
    const before = structuredClone({ input, options, context });
    freeze(input); freeze(options); freeze(context);
    const result = calculate(input, options, context);
    (result.natal.extensions!.synthetic as { labels: string[] }).labels.push("changed");
    result.natal.receipt.provenance!.runtime!.name = "changed";
    expect({ input, options, context }).toEqual(before);
  });

  it("keeps results repeatable when calls interleave node choices and pinned clocks", () => {
    const first = calculate({ ...birth, timeScale: "tt", deltaT: 120.5 }, { node: "mean" });
    const before = structuredClone(first);
    calculate({ ...birth, utc: "1850-04-05T06:07:00Z", deltaT: 10 }, { node: "true" });
    calculate({ ...birth, timeScale: "ut1" }, { node: "mean" });
    expect(first).toEqual(before);
    expect(calculate({ ...birth, timeScale: "tt", deltaT: 120.5 }, { node: "mean" })).toEqual(before);
  });
});
