import { afterEach, describe, expect, it, vi } from "vitest";
import * as chartApi from "../src/chart.js";
import { analyzeFactors, castEventChart, searchEclipseCharts } from "../src/index.js";
import type { EclipseAdapter, SuppliedEclipseInstant, SuppliedEclipseSearch } from "../src/index.js";

const place = { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 };
const from = Date.parse("2000-01-01T00:00:00Z");
const to = from + 86_400_000;
const request = { place, from, to };
const contact = (atMs = from + 1000, contactKind = "first-contact"): SuppliedEclipseInstant => ({
  atMs, eclipseKind: "solar", contactKind, clock: "utc", provenance: { fixture: "invented", bracket: [atMs, atMs] }
});
function adapter(events: readonly SuppliedEclipseInstant[] = []): EclipseAdapter {
  return { status: "available", search: () => ({ status: "complete", events, evaluations: 7,
    completeness: "supplied synthetic contacts;no search performed", provenance: { source: "invented", model: [1, 2, 3] } }) };
}
function frozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(frozen);
  }
}
afterEach(() => vi.restoreAllMocks());

describe("supplied eclipse instants", () => {
  it("preserves contact kinds, coincident rows, metadata, and source-order ties", () => {
    const supplied = [contact(to, "last-contact"), contact(from + 1000, "custom-source-definition"),
      { ...contact(from + 1000, "penumbral-begin"), eclipseKind: "lunar" as const }, contact(from, "opening-sample")];
    const result = searchEclipseCharts(request, adapter(supplied));
    expect(result.status).toBe("complete");
    expect(result.eclipses.map(event => [event.at, event.eclipseKind, event.contactKind])).toEqual([
      [new Date(from + 1000).toISOString(), "solar", "custom-source-definition"],
      [new Date(from + 1000).toISOString(), "lunar", "penumbral-begin"],
      [new Date(to).toISOString(), "solar", "last-contact"]
    ]);
    expect(result).toMatchObject({ evaluations: 7,
      completeness: "supplied synthetic contacts;no search performed", provenance: { source: "invented", model: [1, 2, 3] } });
    for (const event of result.eclipses) {
      const chart = castEventChart({ at: event.at, place });
      expect(event.chart).toEqual(chart);
      expect(event).toMatchObject(analyzeFactors(chart));
      expect(event.supplied).toEqual(supplied.find(row => row.contactKind === event.contactKind));
      expect(event.supplied).not.toBe(supplied.find(row => row.contactKind === event.contactKind));
      expect(event.chart.provenance.source).toBe("relative-checkout");
    }
    expect(Object.isFrozen(supplied[0])).toBe(false);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    frozen(result);
  });

  it("casts supplied minima under their exact definition without inferring limb contacts", () => {
    const result = searchEclipseCharts(request, adapter([contact(to, "minimum-shadow-axis-distance")]));
    expect(result.eclipses[0]?.contactKind).toBe("minimum-shadow-axis-distance");
  });

  it("enforces adjacent windows without duplicating their shared edge", () => {
    const edge = from + 1000;
    const a = searchEclipseCharts({ place, from, to: edge }, adapter([contact(edge)]));
    const b = searchEclipseCharts({ place, from: edge, to }, adapter([contact(edge), contact(to)]));
    const whole = searchEclipseCharts(request, adapter([contact(edge), contact(to)]));
    expect([...a.eclipses, ...b.eclipses]).toEqual(whole.eclipses);
  });

  it("passes a frozen normalized UTC window to the adapter, once, after capturing input", () => {
    const source = new Date(from);
    const search = vi.fn(window => {
      expect(window).toEqual({ startMs: from, endMs: to, clock: "utc" });
      frozen(window);
      source.setTime(to);
      return { status: "complete" as const, events: [], evaluations: 0,
        completeness: "synthetic empty search", provenance: null };
    });
    const result = searchEclipseCharts({ place, from: source, to }, { status: "available", search });
    expect(result.request.range.from).toBe(new Date(from).toISOString());
    expect(search).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: "complete", eclipses: [], evaluations: 0 });
    frozen(result);
  });

  it.each(["not-installed", "unsupported-api"] as const)("keeps unavailable %s distinct from a completed empty search", reason => {
    const cast = vi.spyOn(chartApi, "castEventChart");
    const result = searchEclipseCharts(request, { status: "unavailable", reason });
    expect(result).toMatchObject({ status: "unavailable", reason, eclipses: [] });
    expect(result).not.toHaveProperty("evaluations");
    expect(cast).not.toHaveBeenCalled();
    frozen(result);
  });
  it("returns unavailable without an adapter", () => {
    expect(searchEclipseCharts(request)).toMatchObject({ status: "unavailable", reason: "not-installed" });
  });

  it.each(["evaluation-budget", "cancelled"] as const)("preserves %s refusals with no casting", reason => {
    const cast = vi.spyOn(chartApi, "castEventChart");
    const result = searchEclipseCharts(request, { status: "available", search: () => ({
      status: "refused", reason, events: [], evaluations: 11, completeness: "source scan interrupted",
      provenance: { retained: "source metadata" }
    }) });
    expect(result).toMatchObject({ status: "refused", reason, evaluations: 11, eclipses: [],
      completeness: "source scan interrupted", provenance: { retained: "source metadata" } });
    expect(cast).not.toHaveBeenCalled();
    frozen(result);
  });

  it("propagates adapter and ephemeris errors", () => {
    const failure = new Error("synthetic adapter failure");
    expect(() => searchEclipseCharts(request, { status: "available", search() { throw failure; } })).toThrow(failure);
    const at = Date.parse("+030000-01-01T00:00:00Z");
    expect(() => searchEclipseCharts({ place, from: at - 1, to: at }, adapter([contact(at)]))).toThrow(RangeError);
  });

  it.each([
    { clock: "tt" }, { clock: "ut1" }, { atMs: from - 1 }, { atMs: to + 1 }, { atMs: from + 0.5 },
    { atMs: NaN }, { eclipseKind: "planetary" }, { contactKind: "" }, { contactKind: " first-contact" },
    { contactKind: "first\ncontact" }, { provenance: undefined }, { provenance: new Date() }
  ])("rejects invalid supplied contacts before casting any chart: %j", patch => {
    const cast = vi.spyOn(chartApi, "castEventChart");
    expect(() => searchEclipseCharts(request, adapter([contact(), { ...contact(), ...patch } as SuppliedEclipseInstant])))
      .toThrow(RangeError);
    expect(cast).not.toHaveBeenCalled();
  });

  it.each([
    { evaluations: -1 }, { evaluations: 1.5 }, { evaluations: Infinity }, { status: "partial" },
    { completeness: "" }, { events: null }, { provenance: undefined },
    { status: "refused", reason: "evaluation-budget", events: [contact()] },
    { status: "refused", reason: "other", events: [] }
  ])("rejects malformed results: %j", patch => {
    expect(() => searchEclipseCharts(request, { status: "available", search: () => ({
      status: "complete", events: [], evaluations: 0, completeness: "supplied", provenance: null,
      ...patch
    } as unknown as SuppliedEclipseSearch) })).toThrow(RangeError);
  });

  it("refuses non-JSON, cyclic, sparse and accessor metadata without invoking getters", () => {
    const getter = vi.fn(() => "not data");
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    for (const provenance of [cycle, [undefined], Array(2), { x: 1n }, { x: () => 1 },
      { [Symbol("x")]: 1 }, Object.defineProperty({}, "x", { get: getter, enumerable: true })]) {
      expect(() => searchEclipseCharts(request, adapter([{ ...contact(), provenance } as SuppliedEclipseInstant])))
        .toThrow(RangeError);
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([null, {}, { status: "unavailable", reason: "other" }, { status: "available", search: 1 }])(
    "rejects malformed adapters %j", value => {
      expect(() => searchEclipseCharts(request, value as unknown as EclipseAdapter)).toThrow(RangeError);
    });
  it("validates requests before calling the adapter", () => {
    const search = vi.fn();
    for (const bad of [{ ...request, from: to }, { ...request, place: { latitude: 90, longitude: 0 } },
      { ...request, timeScale: "tt" }]) {
      expect(() => searchEclipseCharts(bad, { status: "available", search })).toThrow(RangeError);
    }
    expect(search).not.toHaveBeenCalled();
  });
});
