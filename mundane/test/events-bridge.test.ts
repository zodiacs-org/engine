import { describe, expect, it, vi } from "vitest";
import { createEventsEclipseAdapter, searchEclipseCharts } from "../src/index.js";
import type { EventsEclipseSettings } from "../src/index.js";
import { loadEventsEclipseAdapter } from "../src/events-loader.js";

const settings: EventsEclipseSettings = { model: { sunRadiusAu: 4, moonRadiusAu: 1, earthRadiusAu: 2 },
  stepMs: 1000, derivativeStepMs: 10, maxEvaluations: 100 };
const from = Date.parse("2000-01-01T00:00:00Z");
const window = { startMs: from, endMs: from + 10_000, clock: "utc" as const };
const request = { place: { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 },
  from: window.startMs, to: window.endMs };

// This is a structural stub, not an eclipse solver or an astronomical fixture.
// It checks delegation against the events branch contract inspected for M11.
function sourceModule() {
  class Context {
    evaluations = 0;
    constructor(readonly window: unknown, readonly options: unknown) {}
  }
  const contexts: Context[] = [];
  const sourceEvents: unknown[] = [];
  const searchEclipses = vi.fn((context: Context, kind: "solar" | "lunar", model: unknown, options: unknown) => {
    expect(context.window).toEqual(window);
    expect(context.options).toEqual({ maxEvaluations: 100 });
    expect(model).toEqual(settings.model);
    expect(options).toEqual({ stepMs: 1000, derivativeStepMs: 10 });
    contexts.push(context);
    context.evaluations += 10;
    const event = { kind, atMs: from + (kind === "solar" ? 5000 : 1000), clock: "utc",
      definition: "minimum-shadow-axis-distance", classification: kind === "solar" ? "central" : "total",
      bracket: [from + 1000, from + 5000], derivativeResidualAuSquaredPerMs: 0,
      model, axisDistanceAu: 0, penumbraRadiusAu: 1, umbraRadiusAu: 0.5, forward: true };
    sourceEvents.push(event);
    return { status: "complete", events: [event], evaluations: context.evaluations };
  });
  return { module: { EvaluationContext: Context, searchEclipses }, contexts, sourceEvents, searchEclipses };
}

describe("events eclipse bridge", () => {
  it("delegates both searches to one shared context, preserving minima and raw source metadata", () => {
    const source = sourceModule();
    const result = searchEclipseCharts(request, createEventsEclipseAdapter(source.module, settings));
    expect(source.searchEclipses).toHaveBeenCalledTimes(2);
    expect(source.contexts[0]).toBe(source.contexts[1]);
    expect(result).toMatchObject({ status: "complete", evaluations: 20,
      completeness: "events-sampled-minima;conditional-on-scan-and-derivative-steps;not-contact-search;not-proven",
      provenance: { source: "events-relative-checkout", settings, searches: [
        { kind: "solar", result: { evaluations: 10 } }, { kind: "lunar", result: { evaluations: 20 } }
      ] } });
    expect(result.eclipses.map(row => [row.eclipseKind, row.contactKind])).toEqual([
      ["lunar", "minimum-shadow-axis-distance"], ["solar", "minimum-shadow-axis-distance"]
    ]);
    expect(result.eclipses[0]?.supplied.provenance).toEqual(source.sourceEvents[1]);
    expect(Object.isFrozen(source.sourceEvents[0])).toBe(false);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it.each(["solar", "lunar"] as const)("discards all instants when %s refuses", refusedKind => {
    const source = sourceModule();
    const original = source.searchEclipses.getMockImplementation()!;
    source.searchEclipses.mockImplementation((context, kind, model, options) => kind !== refusedKind
      ? original(context, kind, model, options) :
      { status: "refused", reason: "evaluation-budget", events: [], evaluations: 100 } as never);
    const result = searchEclipseCharts(request, createEventsEclipseAdapter(source.module, settings));
    expect(result).toMatchObject({ status: "refused", reason: "evaluation-budget", evaluations: 100, eclipses: [] });
    expect(source.searchEclipses).toHaveBeenCalledTimes(refusedKind === "solar" ? 1 : 2);
    expect(result).toHaveProperty("provenance.searches");
  });

  it("preserves cancellation and propagates source computation errors", () => {
    const source = sourceModule();
    source.searchEclipses.mockReturnValue({ status: "refused", reason: "cancelled", events: [], evaluations: 0 } as never);
    expect(searchEclipseCharts(request, createEventsEclipseAdapter(source.module, settings)))
      .toMatchObject({ status: "refused", reason: "cancelled", eclipses: [] });
    const error = new Error("source engine refusal");
    source.searchEclipses.mockImplementation(() => { throw error; });
    expect(() => searchEclipseCharts(request, createEventsEclipseAdapter(source.module, settings))).toThrow(error);
  });

  it("snapshots settings without freezing or retaining caller data", () => {
    const mutable = { ...settings, model: { ...settings.model } };
    const source = sourceModule();
    const adapter = createEventsEclipseAdapter(source.module, mutable);
    mutable.model.sunRadiusAu = 100;
    mutable.stepMs = 2000;
    expect(searchEclipseCharts(request, adapter).status).toBe("complete");
    expect(Object.isFrozen(mutable.model)).toBe(false);
  });

  it.each([{}, { searchEclipses() {} }, { EvaluationContext() {} }, 42, undefined])(
    "returns unsupported-api for incompatible modules %j", module => {
      expect(createEventsEclipseAdapter(module, settings)).toEqual({ status: "unavailable", reason: "unsupported-api" });
    });
  it.each([
    { stepMs: 0 }, { derivativeStepMs: 0.5 }, { maxEvaluations: Infinity },
    { model: { sunRadiusAu: 1, moonRadiusAu: 1, earthRadiusAu: 2 } },
    { model: { sunRadiusAu: 4, moonRadiusAu: -1, earthRadiusAu: 2 } }, { model: null },
    { extra: true }
  ])("rejects invalid or implicit settings %j", patch => {
    expect(() => createEventsEclipseAdapter(null, { ...settings, ...patch } as EventsEclipseSettings)).toThrow(RangeError);
  });
  it.each([
    { status: "partial", events: [], evaluations: 0 },
    { status: "complete", events: [], evaluations: 101 },
    { status: "refused", reason: "other", events: [], evaluations: 1 },
    { status: "refused", reason: "cancelled", events: [{}], evaluations: 1 },
    { status: "complete", events: [{ kind: "solar", clock: "tt", definition: "minimum-shadow-axis-distance" }], evaluations: 1 },
    { status: "complete", events: [{ kind: "solar", clock: "utc", definition: "maximum" }], evaluations: 1 }
  ])("rejects incompatible results %j", invalid => {
    const source = sourceModule();
    source.searchEclipses.mockReturnValue(invalid as never);
    expect(() => searchEclipseCharts(request, createEventsEclipseAdapter(source.module, settings))).toThrow(RangeError);
  });
});

describe("optional module loading", () => {
  it("loads a supplied local module without performing a search", async () => {
    const source = sourceModule();
    const load = vi.fn(async () => source.module);
    const adapter = await loadEventsEclipseAdapter(settings, load);
    expect(adapter.status).toBe("available");
    expect(load).toHaveBeenCalledTimes(1);
    expect(source.searchEclipses).not.toHaveBeenCalled();
    expect(searchEclipseCharts(request, adapter).status).toBe("complete");
  });
  it("distinguishes absent and incompatible modules", async () => {
    expect(await loadEventsEclipseAdapter(settings, async () => null))
      .toEqual({ status: "unavailable", reason: "not-installed" });
    expect(await loadEventsEclipseAdapter(settings, async () => ({})))
      .toEqual({ status: "unavailable", reason: "unsupported-api" });
  });
  it("propagates load failures, including missing nested dependencies", async () => {
    const failure = Object.assign(new Error("synthetic missing nested dependency"), { code: "ERR_MODULE_NOT_FOUND" });
    await expect(loadEventsEclipseAdapter(settings, async () => { throw failure; })).rejects.toBe(failure);
  });
  it("validates settings before calling a loader", async () => {
    const load = vi.fn();
    await expect(loadEventsEclipseAdapter({ ...settings, maxEvaluations: 0 }, load)).rejects.toThrow(RangeError);
    expect(load).not.toHaveBeenCalled();
  });
  it("captures settings before awaiting the loader", async () => {
    const mutable = { ...settings, model: { ...settings.model } };
    const source = sourceModule();
    const adapter = await loadEventsEclipseAdapter(mutable, async () => {
      mutable.stepMs = 2000;
      mutable.model.sunRadiusAu = 100;
      return source.module;
    });
    expect(searchEclipseCharts(request, adapter).status).toBe("complete");
  });
});
