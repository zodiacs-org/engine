import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CalcTime } from "@zodiacs/engine/calc";
import {
  APSIS_BODIES, DISTANCE_TARGETS, PLANETARY_BODIES,
  WINDOW_DEFAULT_MAX_EVALUATIONS, searchApsidesWindow,
  searchLunarApsides, searchPlanetaryApsides
} from "../src/index.js";
import type {
  ApsisBody, ApsidesWindowEvent, ApsidesWindowOptions, ApsidesWindowResult,
  LunarSearchResult, PlanetarySearchResult
} from "../src/index.js";
import * as sampling from "../src/sample.js";

const tt = (jd: number): CalcTime => ({ jd, scale: "tt" });
const bodies = ["Moon", "Mercury", "Earth"] as const;
const fromJdTt = 2_451_544.5;
const toJdTt = 2_451_575.5;
const month = { from: tt(fromJdTt), to: tt(toJdTt), bodies };
type Complete = Extract<ApsidesWindowResult, { status: "complete" }>;
type IndividualComplete = Extract<LunarSearchResult | PlanetarySearchResult, { status: "complete" }>;
const individual = new Map<ApsisBody, IndividualComplete>();
let whole: Complete;

function complete(options: ApsidesWindowOptions = month): Complete {
  const result = searchApsidesWindow(options);
  if (result.status !== "complete") throw new Error(`${result.failedBody}: ${result.reason}: ${result.detail}`);
  return result;
}

beforeAll(() => {
  // January 2000 TT is the Moon's registered development window and a
  // subwindow of the registered Mercury and Earth development cases.
  for (const body of bodies) {
    const options = { from: month.from, to: month.to };
    const result = body === "Moon" ? searchLunarApsides(options) : searchPlanetaryApsides(body, options);
    if (result.status !== "complete") throw new Error(`${body}: ${result.reason}: ${result.detail}`);
    individual.set(body, result);
  }
  whole = complete();
}, 30_000);
afterEach(() => vi.restoreAllMocks());

// These tests check composition, event ownership and work accounting. Comparing
// with individual searches is integration evidence, not an accuracy reference.
// Actual event searches remain inside the registered development cases.
describe("combined apsis windows", () => {
  it("merges the selected lunar and planetary events in TT order without changing their records", () => {
    const expected = bodies.flatMap<ApsidesWindowEvent>((body) => individual.get(body)!.events).sort((left, right) =>
      left.instant.jdTt - right.instant.jdTt || APSIS_BODIES.indexOf(left.body) - APSIS_BODIES.indexOf(right.body)
    );
    expect(whole.events).toEqual(expected);
    expect(new Set(whole.events.map(({ body }) => body))).toEqual(new Set(bodies));
    expect(whole.window).toEqual({
      from: individual.get("Moon")!.window.from,
      to: individual.get("Moon")!.window.to,
      boundary: "(from,to]"
    });
    expect(whole.diagnostics).toMatchObject({
      evaluations: bodies.reduce((sum, body) => sum + individual.get(body)!.diagnostics.evaluations, 0),
      maxEvaluations: WINDOW_DEFAULT_MAX_EVALUATIONS,
      completeness: "sampled-not-proven"
    });
    expect(whole.diagnostics.bodies.map(({ body }) => body)).toEqual(bodies);
    let spent = 0;
    for (const entry of whole.diagnostics.bodies) {
      const expectedBody = individual.get(entry.body)!;
      expect(entry.status).toBe("complete");
      if (entry.status !== "complete") throw new Error("A completed body lost its diagnostic entry");
      expect(entry.target).toEqual(DISTANCE_TARGETS[entry.body]);
      expect(entry.window).toEqual(expectedBody.window);
      expect(entry.window.endpointReceipts.from.request.body).toBe(entry.body);
      expect(entry.window.endpointReceipts.to.request.body).toBe(entry.body);
      expect(entry.diagnostics).toEqual({
        ...expectedBody.diagnostics, maxEvaluations: WINDOW_DEFAULT_MAX_EVALUATIONS - spent
      });
      spent += entry.diagnostics.evaluations;
    }
    expect(JSON.parse(JSON.stringify(whole))).toEqual(whole);
  });

  it("canonicalizes the caller's selection order and supports a one-body subset", () => {
    expect(complete({ ...month, bodies: ["Earth", "Moon", "Mercury"] })).toEqual(whole);
    expect(complete({ ...month, bodies: ["Mercury", "Earth", "Moon"] })).toEqual(whole);
    const selected = complete({ ...month, bodies: ["Earth"] });
    expect(selected.events).toEqual(individual.get("Earth")!.events);
    expect(selected.diagnostics.bodies.map(({ body }) => body)).toEqual(["Earth"]);
  });

  it("defaults to every supported body and resolves an empty interval without a grid", () => {
    expect(APSIS_BODIES).toEqual(["Moon", ...PLANETARY_BODIES]);
    expect(Object.isFrozen(APSIS_BODIES)).toBe(true);
    expect(WINDOW_DEFAULT_MAX_EVALUATIONS).toBe(100_000);
    const sample = vi.spyOn(sampling, "sampleDistance");
    // Equal endpoints exercise default selection without searching an
    // unregistered outer-planet event window or consulting held-out cases.
    const empty = complete({ from: month.from, to: month.from });
    expect(empty.events).toEqual([]);
    expect(empty.diagnostics.evaluations).toBe(APSIS_BODIES.length * 2);
    expect(sample).toHaveBeenCalledTimes(empty.diagnostics.evaluations);
    expect(empty.diagnostics.bodies.map(({ body }) => body)).toEqual(APSIS_BODIES);
    expect(sample.mock.calls.map(([body]) => body)).toEqual(APSIS_BODIES.flatMap((body) => [body, body]));
    for (const entry of empty.diagnostics.bodies) {
      expect(entry).toMatchObject({
        status: "complete", target: DISTANCE_TARGETS[entry.body],
        diagnostics: { evaluations: 2, grid: null, completeness: "sampled-not-proven" }
      });
    }
  });

  it("does not mutate or retain the caller's body list, Dates or options", () => {
    const from = new Date("2000-01-02T00:00:00Z");
    const to = new Date("2000-01-30T00:00:00Z");
    const selected: ApsisBody[] = ["Earth", "Moon", "Mercury"];
    const options = Object.freeze({ from, to, bodies: selected });
    const result = complete(options);
    const snapshot = JSON.parse(JSON.stringify(result));
    expect(selected).toEqual(["Earth", "Moon", "Mercury"]);
    expect(from.toISOString()).toBe("2000-01-02T00:00:00.000Z");
    expect(to.toISOString()).toBe("2000-01-30T00:00:00.000Z");
    expect(complete(Object.freeze({ ...month, bodies: Object.freeze([...bodies]) }))).toEqual(whole);
    selected.splice(0, selected.length, "Pluto");
    from.setUTCFullYear(2002);
    to.setUTCFullYear(2002);
    expect(result).toEqual(snapshot);
    for (const entry of result.diagnostics.bodies) {
      if (entry.status !== "complete") throw new Error("Unexpected incomplete body");
      expect(entry.window.endpointReceipts.from.request.time).toEqual({ iso: "2000-01-02T00:00:00.000Z" });
      expect(entry.window.endpointReceipts.to.request.time).toEqual({ iso: "2000-01-30T00:00:00.000Z" });
    }
  });
});

describe("combined window ownership", () => {
  it("partitions at event estimates, grid nodes and adjacent representable TT coordinates", () => {
    const cuts = new Set([
      2_451_550,
      ...whole.events.flatMap(({ instant }) => [
        instant.jdTt, instant.jdTt - 1 / 86_400, instant.jdTt + 1 / 86_400,
        // Adjacent binary64 JDs at the epoch used by this development window.
        instant.jdTt - 2 ** -31, instant.jdTt + 2 ** -31
      ])
    ]);
    for (const cut of cuts) {
      const left = complete({ ...month, to: tt(cut) });
      const right = complete({ ...month, from: tt(cut) });
      expect([...left.events, ...right.events]).toEqual(whole.events);
      expect(left.events.every(({ instant }) => instant.jdTt <= cut)).toBe(true);
      expect(right.events.every(({ instant }) => instant.jdTt > cut)).toBe(true);
    }
  }, 30_000);

  it("preserves pinned endpoint receipts and partitions the resolved TT window", () => {
    const pinned = complete({
      from: { iso: "2000-01-02", deltaT: 100 },
      to: { iso: "2000-01-30", deltaT: 200 }, bodies
    });
    expect(pinned.window.from.deltaT.model).toBe("pinned");
    expect(pinned.window.to.deltaT.model).toBe("pinned");
    const resolved = complete({
      from: tt(pinned.window.from.jdTt), to: tt(pinned.window.to.jdTt), bodies
    });
    expect(resolved.events).toEqual(pinned.events);
    for (const entry of pinned.diagnostics.bodies) {
      if (entry.status !== "complete") throw new Error("Unexpected incomplete body");
      expect(entry.window.endpointReceipts.from.request.time).toEqual({ iso: "2000-01-02", deltaT: 100 });
      expect(entry.window.endpointReceipts.to.request.time).toEqual({ iso: "2000-01-30", deltaT: 200 });
    }
    const cut = pinned.events[0]!.instant.jdTt;
    const left = complete({ from: { iso: "2000-01-02", deltaT: 100 }, to: tt(cut), bodies });
    const right = complete({ from: tt(cut), to: { iso: "2000-01-30", deltaT: 200 }, bodies });
    expect([...left.events, ...right.events]).toEqual(pinned.events);
    for (const event of pinned.events) {
      expect(event.instant.timeScale.input).toBe("tt");
      expect(event.instant.deltaT.model).not.toBe("pinned");
    }
  });
});

describe("combined evaluation budget", () => {
  it("counts every engine call and accepts exactly the sum of the selected body work", () => {
    const cap = whole.diagnostics.evaluations;
    const sample = vi.spyOn(sampling, "sampleDistance");
    const exact = complete({ ...month, maxEvaluations: cap });
    expect(exact.events).toEqual(whole.events);
    expect(exact.diagnostics.evaluations).toBe(cap);
    expect(exact.diagnostics.maxEvaluations).toBe(cap);
    expect(sample).toHaveBeenCalledTimes(cap);
    let spent = 0;
    for (const entry of exact.diagnostics.bodies) {
      if (entry.status !== "complete") throw new Error("Unexpected incomplete body");
      expect(entry.diagnostics.maxEvaluations).toBe(cap - spent);
      expect(sample.mock.calls.filter(([body]) => body === entry.body)).toHaveLength(entry.diagnostics.evaluations);
      spent += entry.diagnostics.evaluations;
    }
    expect(spent).toBe(cap);
  });

  it("drops earlier body events when the final body is one call short", () => {
    const cap = whole.diagnostics.evaluations - 1;
    const sample = vi.spyOn(sampling, "sampleDistance");
    const result = searchApsidesWindow({ ...month, maxEvaluations: cap });
    expect(result).toMatchObject({
      status: "refused", failedBody: "Earth", reason: "evaluation-budget", events: [], engineRefusal: null
    });
    expect(result.window).toEqual(whole.window);
    expect(result.diagnostics.evaluations).toBe(cap);
    expect(sample).toHaveBeenCalledTimes(cap);
    expect(result.diagnostics.bodies.map(({ status }) => status)).toEqual(["complete", "complete", "refused"]);
    expect(result.diagnostics.bodies[2]).toMatchObject({
      body: "Earth", reason: "evaluation-budget", engineRefusal: null
    });
    expect(result.diagnostics.bodies.reduce((sum, entry) => sum + (entry.diagnostics?.evaluations ?? 0), 0)).toBe(cap);
  });

  it("refuses without another engine call when the budget ends exactly between bodies", () => {
    const cap = individual.get("Moon")!.diagnostics.evaluations;
    const sample = vi.spyOn(sampling, "sampleDistance");
    const result = searchApsidesWindow({ ...month, maxEvaluations: cap });
    expect(result).toMatchObject({
      status: "refused", failedBody: "Mercury", reason: "evaluation-budget", events: [], engineRefusal: null
    });
    expect(result.window).toEqual(whole.window);
    expect(result.diagnostics.evaluations).toBe(cap);
    expect(sample).toHaveBeenCalledTimes(cap);
    expect(sample.mock.calls.every(([body]) => body === "Moon")).toBe(true);
    expect(result.diagnostics.bodies.map(({ status }) => status)).toEqual(["complete", "not-started", "not-started"]);
    for (const entry of result.diagnostics.bodies.slice(1)) {
      expect(entry).toMatchObject({ status: "not-started", window: null, diagnostics: null });
    }
  });
});
