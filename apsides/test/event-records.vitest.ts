import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { calc } from "@zodiacs/engine/calc";
import type { CalcTime } from "@zodiacs/engine/calc";
import {
  APSIS_BODIES, AU_KM, DISTANCE_TARGETS, searchApsidesWindow,
  searchLunarApsides, searchPlanetaryApsides
} from "../src/index.js";
import type {
  ApsisBody, ApsisMotionSample, ApsidesWindowEvent, DistanceSample,
  LunarSearchOptions, LunarSearchResult, PlanetarySearchResult
} from "../src/index.js";
import * as sampling from "../src/sample.js";
import * as scalarSolver from "../src/solver.js";

const DAY_SECONDS = 86_400;
const tt = (jd: number): CalcTime => ({ jd, scale: "tt" });
type Complete = Extract<LunarSearchResult | PlanetarySearchResult, { status: "complete" }>;
const plan = JSON.parse(readFileSync(new URL("../references/plan.json", import.meta.url), "utf8")) as {
  cases: { split: string; body: string; fromTt: string; toTt: string }[];
};
const windows = new Map<ApsisBody, LunarSearchOptions>();
for (const body of APSIS_BODIES) {
  const cases = plan.cases.filter((entry) => entry.split === "development" && entry.body === body);
  if (cases.length !== 1) throw new Error(`Expected one registered development window for ${body}`);
  const entry = cases[0]!;
  // Calendar labels in the registration are TT. Date arithmetic only converts
  // Gregorian fields to a JD here; it performs no UTC-to-TT correction.
  const asTt = (date: string): CalcTime => tt(Date.parse(`${date}T00:00:00Z`) / 86_400_000 + 2_440_587.5);
  windows.set(body, { from: asTt(entry.fromTt), to: asTt(entry.toTt) });
}

function complete(body: ApsisBody, options = windows.get(body)!): Complete {
  const result = body === "Moon" ? searchLunarApsides(options) : searchPlanetaryApsides(body, options);
  if (result.status !== "complete") throw new Error(`${body}: ${result.reason}: ${result.detail}`);
  return result;
}

function replayProbe(body: ApsisBody, probe: ApsisMotionSample): void {
  const replay = calc(probe.receipt.request);
  expect(replay.status).toBe("ok");
  if (replay.status !== "ok") throw new Error("Motion receipt replay refused");
  expect(probe).not.toHaveProperty("status");
  expect(probe).not.toHaveProperty("target");
  expect(probe.receipt.request).toMatchObject({
    body, center: DISTANCE_TARGETS[body].center, frame: "equatorial-j2000",
    time: { jd: probe.instant.jdTt, scale: "tt" },
    flags: { correction: "geometric", cartesian: true, speeds: true }
  });
  expect(probe.instant).toEqual(replay.receipt.instants[0]);
  expect(probe.instant.timeScale.input).toBe("tt");
  expect(probe.bounds).toEqual(replay.bounds);
  expect(probe.bounds.speed).toMatchObject(body === "Moon"
    ? { method: "central-difference", stepDays: 0.001, unit: "arcsec/day" }
    : { method: "analytic", stepDays: null, unit: "arcsec/day" });
  expect(probe.receipt).toEqual(replay.receipt);
  expect(probe.distanceAu).toBe(replay.dist);
  expect(probe.distanceKm).toBe(replay.dist! * AU_KM);
  expect(probe.radialSpeedKmPerSecond).toBe(replay.speeds!.dist! * AU_KM / DAY_SECONDS);
  expect(probe.orbitalSpeedKmPerSecond).toBe(
    Math.hypot(replay.cartesian!.vx!, replay.cartesian!.vy!, replay.cartesian!.vz!) * AU_KM / DAY_SECONDS
  );
  expect(probe.orbitalSpeedKmPerSecond).toBeGreaterThan(0);
}

afterEach(() => vi.restoreAllMocks());

// These are integration and serialization contracts, not astronomical accuracy
// evidence. Searches use only registered development windows or subwindows.
// No held-out fixture is opened, and no prior engine output supplies an oracle.
describe("complete event motion records", () => {
  const results = new Map<ApsisBody, Complete>();
  beforeAll(() => {
    for (const body of APSIS_BODIES) results.set(body, complete(body));
  }, 30_000);

  it.each(APSIS_BODIES)("replays every JSON-decoded %s motion sample with its units and bounds", (body) => {
    const result = results.get(body)!;
    expect(result.events.length).toBeGreaterThan(0);
    const decoded = JSON.parse(JSON.stringify(result)) as Complete;
    expect(decoded).toEqual(result);
    for (const event of decoded.events) {
      expect(event.target).toEqual(DISTANCE_TARGETS[body]);
      expect(event.motion.sampling).toBe("canonical-distance-bracket");
      const { before, at, after } = event.motion;
      expect(before.instant.jdTt).toBeLessThan(event.instant.jdTt);
      expect(after.instant.jdTt).toBeGreaterThan(event.instant.jdTt);
      expect(before.offsetSeconds).toBeLessThan(0);
      expect(at.offsetSeconds).toBe(0);
      expect(after.offsetSeconds).toBeGreaterThan(0);
      for (const probe of [before, at, after]) {
        expect(probe.offsetSeconds).toBe((probe.instant.jdTt - event.instant.jdTt) * DAY_SECONDS);
        replayProbe(body, probe);
      }
      for (const [probe, witness] of [
        [before, event.refinement.bracket[0]], [after, event.refinement.bracket[2]]
      ] as const) {
        expect(probe.instant.jdTt).toBe(witness.jdTt);
        expect(probe.distanceKm).toBe(witness.distanceKm);
        const direction = event.kind === "perigee" || event.kind === "perihelion" ? 1 : -1;
        expect(direction * (probe.distanceKm - event.distanceKm)).toBeGreaterThan(0);
      }
      const { body: _body, kind: _kind, target: _target, refinement: _refinement,
        motion: _motion, ...eventSample } = event;
      const { offsetSeconds: _offset, ...atSample } = at;
      expect(atSample).toEqual(eventSample);
    }
  });

  it("retains asymmetric canonical witnesses outside a tiny window and across its partition", () => {
    const event = results.get("Moon")!.events[0]!;
    const jd = event.instant.jdTt;
    const fromJd = jd - 1 / DAY_SECONDS;
    const toJd = jd + 1 / DAY_SECONDS;
    const whole = complete("Moon", { from: tt(fromJd), to: tt(toJd) });
    const left = complete("Moon", { from: tt(fromJd), to: tt(jd) });
    const right = complete("Moon", { from: tt(jd), to: tt(toJd) });
    expect(whole.events).toEqual([event]);
    expect([...left.events, ...right.events]).toEqual(whole.events);
    expect(right.events).toEqual([]);
    expect(event.motion.before.instant.jdTt).toBeLessThan(fromJd);
    expect(event.motion.after.instant.jdTt).toBeGreaterThan(toJd);
    // Probes use the bracket, not a fictitious symmetric offset around the root.
    expect(-event.motion.before.offsetSeconds).not.toBe(event.motion.after.offsetSeconds);
  });

  it("serializes combined events, empty windows and refused results without losing records", () => {
    const options = windows.get("Moon")!;
    const combined = searchApsidesWindow({ ...options, bodies: ["Earth", "Moon", "Mercury"] });
    expect(combined.status).toBe("complete");
    const decoded = JSON.parse(JSON.stringify(combined)) as typeof combined;
    expect(decoded).toEqual(combined);
    if (decoded.status !== "complete") throw new Error("Combined window refused");
    const expected = (["Moon", "Mercury", "Earth"] as const).flatMap<ApsidesWindowEvent>((body) =>
      complete(body, options).events
    );
    expected.sort((a, b) => a.instant.jdTt - b.instant.jdTt ||
      APSIS_BODIES.indexOf(a.body) - APSIS_BODIES.indexOf(b.body));
    expect(decoded.events).toEqual(expected);
    const empty = searchApsidesWindow({ from: options.from, to: options.from, bodies: ["Moon"] });
    const refused = searchApsidesWindow({ ...options, bodies: ["Moon"], maxEvaluations: 1 });
    expect(empty).toMatchObject({ status: "complete", events: [] });
    expect(refused).toMatchObject({ status: "refused", reason: "evaluation-budget", events: [] });
    for (const result of [empty, refused]) expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

describe("motion diagnostics preserve the sampled model", () => {
  it("retains nonzero same-sign scalar-search rates and assembles probes without new evaluations", () => {
    const origin = 2_451_545;
    const root = origin + 0.125;
    const sampleSpy = vi.spyOn(sampling, "sampleDistance").mockImplementation((_body, time): DistanceSample => {
      if (typeof time !== "object" || time === null || !("jd" in time) || time.scale !== "tt") {
        throw new Error("Synthetic motion samples require a TT JD");
      }
      const jdTt = time.jd;
      const distanceKm = 100 + (jdTt - root) ** 2;
      const instant: DistanceSample["instant"] = {
        utc: new Date((jdTt - 2_440_587.5) * 86_400_000).toISOString(), jdTt, jdUt1: jdTt,
        deltaT: { seconds: 0, sigma: null, model: "pinned", table: null, tableDigest: null, segment: "pinned" },
        timeScale: { input: "tt", basis: "pinned", ut1MinusUtc: null, leapSeconds: null }
      };
      // Synthetic rate values intentionally do not differentiate the distance.
      // The scalar turn remains valid and must not coerce its reported rates.
      return {
        status: "ok", target: DISTANCE_TARGETS.Moon, instant,
        distanceAu: distanceKm / AU_KM, distanceKm,
        radialSpeedKmPerSecond: 0.125, orbitalSpeedKmPerSecond: 3,
        bounds: {
          position: { value: null, unit: "arcsec", label: "estimated", basis: "synthetic test only" },
          distance: null, speed: null
        },
        receipt: {
          schema: "zodiacs.calc-receipt.v1",
          request: {
            body: "Moon", time: tt(jdTt), center: "geocentric", frame: "equatorial-j2000",
            flags: { correction: "geometric", speeds: true, cartesian: true }
          },
          instants: [instant], conventions: ["synthetic-test-only"],
          engine: {
            name: "@zodiacs/engine", version: "0.0.0-synthetic",
            ephemeris: { name: "astronomy-engine", version: "0.0.0-synthetic" }
          }
        }
      };
    });
    const originalSolver = scalarSolver.searchDistanceExtremaWith;
    let callsAfterSolver: number | undefined;
    vi.spyOn(scalarSolver, "searchDistanceExtremaWith").mockImplementation((distanceAt, options) => {
      const result = originalSolver(distanceAt, options);
      callsAfterSolver = sampleSpy.mock.calls.length;
      return result;
    });
    const result = complete("Moon", { from: tt(origin - 1), to: tt(origin + 1) });
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.kind).toBe("perigee");
    for (const probe of [event.motion.before, event.motion.at, event.motion.after]) {
      expect(probe.radialSpeedKmPerSecond).toBe(0.125);
      expect(probe.orbitalSpeedKmPerSecond).toBe(3);
    }
    expect(callsAfterSolver).toBeDefined();
    expect(sampleSpy.mock.calls).toHaveLength(callsAfterSolver!);
    expect(result.diagnostics.evaluations).toBe(callsAfterSolver);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
