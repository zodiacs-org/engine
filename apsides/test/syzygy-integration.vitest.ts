import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as engine from "@zodiacs/engine/calc";
import type { CalcTime } from "@zodiacs/engine/calc";
import { searchApsidesWindow, searchLunarApsides } from "../src/index.js";
import type {
  ApsidesWindowOptions, ApsidesWindowResult, LunarApsis, LunarSearchOptions, LunarSearchResult
} from "../src/index.js";

// The installed archive has a native ESM namespace with nonconfigurable exports.
// This facade leaves the real calculation intact while allowing call accounting.
vi.mock("@zodiacs/engine/calc", async (importOriginal) => ({
  ...await importOriginal<typeof import("@zodiacs/engine/calc")>()
}));

const tt = (jd: number): CalcTime => ({ jd, scale: "tt" });
const month = { from: tt(2_451_544.5), to: tt(2_451_575.5) };
const syzygyOrbDegrees = 10;
const annotated = { ...month, syzygyOrbDegrees };
const bodies = ["Moon", "Mercury", "Earth"] as const;
type LunarComplete = Extract<LunarSearchResult, { status: "complete" }>;
type WindowComplete = Extract<ApsidesWindowResult, { status: "complete" }>;

function lunar(options: LunarSearchOptions = annotated): LunarComplete {
  const result = searchLunarApsides(options);
  if (result.status !== "complete") throw new Error(`${result.reason}: ${result.detail}`);
  return result;
}

function combined(options: ApsidesWindowOptions): WindowComplete {
  const result = searchApsidesWindow(options);
  if (result.status !== "complete") throw new Error(`${result.failedBody}: ${result.reason}: ${result.detail}`);
  return result;
}

function withoutSyzygy(event: LunarApsis): Omit<LunarApsis, "syzygy"> {
  const { syzygy: _syzygy, ...original } = event;
  return original;
}

let baseline: LunarComplete;
let whole: LunarComplete;
let windowBaseline: WindowComplete;
let windowAnnotated: WindowComplete;

beforeAll(() => {
  baseline = lunar(month);
  whole = lunar();
  windowBaseline = combined({ ...month, bodies });
  windowAnnotated = combined({ ...annotated, bodies });
}, 30_000);
afterEach(() => vi.restoreAllMocks());

// January 2000 TT is the registered lunar development window and a subwindow
// of Mercury and Earth's development cases. These tests check integration,
// replay and ownership, not astronomical angular accuracy. No prior output or
// held-out fixture supplies an astronomical expectation.
describe("optional lunar longitude-phase annotations", () => {
  it("leaves original event records intact and performs no angular work when omitted", () => {
    const calculate = vi.spyOn(engine, "calc");
    const result = lunar(month);
    expect(result).toEqual(baseline);
    expect(result.events.length).toBeGreaterThan(0);
    for (const event of result.events) expect(event).not.toHaveProperty("syzygy");
    expect(calculate).toHaveBeenCalledTimes(result.diagnostics.evaluations);
    expect(calculate.mock.calls.every(([request]) => request.flags?.correction === "geometric")).toBe(true);
    expect(whole.events.map(withoutSyzygy)).toEqual(baseline.events);
    expect(whole.window).toEqual(baseline.window);
    expect(whole.diagnostics).toEqual({
      ...baseline.diagnostics, evaluations: baseline.diagnostics.evaluations + 2 * baseline.events.length
    });
  });

  it("retains every measured angular record and replays both receipts after JSON serialization", () => {
    const decoded = JSON.parse(JSON.stringify(whole)) as LunarComplete;
    expect(decoded).toEqual(whole);
    expect(decoded.events.map((event) => event.syzygy?.orbDegrees))
      .toEqual(decoded.events.map(() => syzygyOrbDegrees));
    for (const event of decoded.events) {
      const annotation = event.syzygy;
      expect(annotation).toBeDefined();
      if (!annotation) throw new Error("Requested angular annotation is missing");
      expect(annotation.convention).toBe("geocentric-apparent-ecliptic-longitude-of-date");
      expect(annotation.orbDegrees).toBe(syzygyOrbDegrees);
      expect(annotation.elongationDegrees).toBeGreaterThanOrEqual(0);
      expect(annotation.elongationDegrees).toBeLessThan(360);
      expect(annotation.separationDegrees).toBeGreaterThanOrEqual(0);
      expect(annotation.separationDegrees).toBeLessThanOrEqual(90);
      expect(["new-moon", "full-moon"]).toContain(annotation.nearestPhase);
      expect(annotation.candidate).toBe(annotation.separationDegrees <= syzygyOrbDegrees
        ? event.kind === "perigee" ? "supermoon-candidate" : "micromoon-candidate"
        : null);
      for (const [body, angular] of [["Moon", annotation.moon], ["Sun", annotation.sun]] as const) {
        expect(angular.receipt.request).toMatchObject({
          body, center: "geocentric", frame: "ecliptic-true-of-date",
          time: { jd: event.instant.jdTt, scale: "tt" },
          flags: { correction: "apparent", speeds: false }
        });
        expect(angular.instant).toEqual(event.instant);
        expect(angular.receipt.instants).toEqual([angular.instant]);
        expect(angular.receipt.engine).toEqual(event.receipt.engine);
        const replay = engine.calc(angular.receipt.request);
        expect(replay.status).toBe("ok");
        if (replay.status !== "ok") throw new Error("Angular receipt replay refused");
        expect(angular.longitudeDegrees).toBe(replay.lon);
        expect(angular.bounds).toEqual(replay.bounds);
        expect(angular.receipt).toEqual(replay.receipt);
      }
    }
  });

  it("counts exactly two additional engine calls per returned lunar event", () => {
    const calculate = vi.spyOn(engine, "calc");
    const result = lunar();
    expect(result).toEqual(whole);
    expect(calculate).toHaveBeenCalledTimes(result.diagnostics.evaluations);
    const angular = calculate.mock.calls.filter(([request]) => request.flags?.correction === "apparent");
    expect(angular).toHaveLength(2 * result.events.length);
    for (const event of result.events) {
      const atEvent = angular.filter(([request]) => {
        const time = request.time;
        return typeof time === "object" && time !== null && "jd" in time && time.jd === event.instant.jdTt;
      });
      expect(atEvent.map(([request]) => request.body).sort()).toEqual(["Moon", "Sun"]);
    }
  });

  it("preserves full annotations at event boundaries, adjacent representable TT values and tiny windows", () => {
    for (const event of whole.events) {
      const jd = event.instant.jdTt;
      for (const cut of [jd - 2 ** -31, jd, jd + 2 ** -31]) {
        const left = lunar({ ...annotated, to: tt(cut) });
        const right = lunar({ ...annotated, from: tt(cut) });
        expect([...left.events, ...right.events]).toEqual(whole.events);
      }
      const tiny = { from: tt(jd - 1 / 86_400), to: tt(jd + 1 / 86_400), syzygyOrbDegrees };
      expect(lunar(tiny).events).toEqual([event]);
      expect(lunar({ ...tiny, to: tt(jd) }).events).toEqual([event]);
      expect(lunar({ ...tiny, from: tt(jd) }).events).toEqual([]);
    }
  }, 30_000);

  it("performs no angular work for empty windows or padded events outside the owned window", () => {
    const event = whole.events[0]!;
    const jd = event.instant.jdTt;
    for (const options of [
      { ...annotated, to: month.from },
      { from: tt(jd), to: tt(jd + 1 / 86_400), syzygyOrbDegrees }
    ]) {
      const calculate = vi.spyOn(engine, "calc");
      const result = lunar(options);
      expect(result.events).toEqual([]);
      expect(calculate).toHaveBeenCalledTimes(result.diagnostics.evaluations);
      expect(calculate.mock.calls.every(([request]) => request.flags?.correction === "geometric")).toBe(true);
      calculate.mockRestore();
    }
  });

  it("accepts the exact annotated budget and refuses one call short without partial results", () => {
    const cap = whole.diagnostics.evaluations;
    const calculate = vi.spyOn(engine, "calc");
    const exact = lunar({ ...annotated, maxEvaluations: cap });
    expect(exact.events).toEqual(whole.events);
    expect(exact.diagnostics).toMatchObject({ evaluations: cap, maxEvaluations: cap });
    expect(calculate).toHaveBeenCalledTimes(cap);
    calculate.mockClear();
    const short = searchLunarApsides({ ...annotated, maxEvaluations: cap - 1 });
    expect(short).toMatchObject({ status: "refused", reason: "evaluation-budget", events: [], engineRefusal: null });
    expect(short.window).toEqual(whole.window);
    expect(short.diagnostics).toMatchObject({ evaluations: cap - 1, maxEvaluations: cap - 1 });
    expect(calculate).toHaveBeenCalledTimes(cap - 1);
    expect(JSON.parse(JSON.stringify(short))).toEqual(short);
  });
});

describe("annotations in a combined window", () => {
  it("preserves every planetary event and merges the individually annotated lunar events", () => {
    expect(windowAnnotated.events.filter(({ body }) => body === "Moon")).toEqual(whole.events);
    const planets = windowAnnotated.events.filter(({ body }) => body !== "Moon");
    expect(planets).toEqual(windowBaseline.events.filter(({ body }) => body !== "Moon"));
    for (const event of planets) expect(event).not.toHaveProperty("syzygy");
    expect(windowAnnotated.window).toEqual(windowBaseline.window);
    expect(windowAnnotated.diagnostics.evaluations).toBe(
      windowBaseline.diagnostics.evaluations + 2 * whole.events.length
    );
    expect(JSON.parse(JSON.stringify(windowAnnotated))).toEqual(windowAnnotated);
    const cut = whole.events[0]!.instant.jdTt;
    const left = combined({ ...annotated, bodies, to: tt(cut) });
    const right = combined({ ...annotated, bodies, from: tt(cut) });
    expect([...left.events, ...right.events]).toEqual(windowAnnotated.events);
  });

  it("counts annotation work within the shared cap and refuses one total call short", () => {
    const cap = windowAnnotated.diagnostics.evaluations;
    const calculate = vi.spyOn(engine, "calc");
    const exact = combined({ ...annotated, bodies, maxEvaluations: cap });
    expect(exact.events).toEqual(windowAnnotated.events);
    expect(exact.diagnostics).toMatchObject({ evaluations: cap, maxEvaluations: cap });
    expect(calculate).toHaveBeenCalledTimes(cap);
    let spent = 0;
    for (const entry of exact.diagnostics.bodies) {
      if (entry.status !== "complete") throw new Error("Expected completed body diagnostics");
      expect(entry.diagnostics.maxEvaluations).toBe(cap - spent);
      spent += entry.diagnostics.evaluations;
    }
    expect(spent).toBe(cap);
    calculate.mockClear();
    const short = searchApsidesWindow({ ...annotated, bodies, maxEvaluations: cap - 1 });
    expect(short).toMatchObject({
      status: "refused", failedBody: "Earth", reason: "evaluation-budget", events: [], engineRefusal: null
    });
    expect(short.diagnostics.evaluations).toBe(cap - 1);
    expect(calculate).toHaveBeenCalledTimes(cap - 1);
  });

  it("stops before the next body when annotated lunar work exactly spends the shared cap", () => {
    const cap = whole.diagnostics.evaluations;
    const calculate = vi.spyOn(engine, "calc");
    const result = searchApsidesWindow({ ...annotated, bodies, maxEvaluations: cap });
    expect(result).toMatchObject({
      status: "refused", failedBody: "Mercury", reason: "evaluation-budget", events: [], engineRefusal: null
    });
    expect(result.diagnostics.evaluations).toBe(cap);
    expect(calculate).toHaveBeenCalledTimes(cap);
    expect(calculate.mock.calls.every(([request]) => request.body === "Moon" || request.body === "Sun")).toBe(true);
    expect(result.diagnostics.bodies.map(({ status }) => status)).toEqual(["complete", "not-started", "not-started"]);
  });
});
