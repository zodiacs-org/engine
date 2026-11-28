import { describe, expect, it } from "vitest";
import { createAspectSearchPolicy, createImpedimentPolicy, evaluateImpedimentsWith } from "../src/index.js";
import type { AspectLongitudeAt, AspectSpeedAt, HoraryImpediments, ImpedimentPolicyInput, ImpedimentRule } from "../src/index.js";
import { DAY, epoch, impedimentFixture } from "./impediments.fixture.js";

const aspects = createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays: 8, maxSamples: 4000 });
const rule = (report: HoraryImpediments, name: ImpedimentRule) => report.applications[0]!.observations.find(row => row.rule === name)!;
const law = () => impedimentFixture({ Mercury: [t => 8 + 4 * t, () => 4] });
const run = (fixture = law(), options: ImpedimentPolicyInput = {}, aspectPolicy = aspects) =>
  evaluateImpedimentsWith(fixture.longitudeAt, fixture.speedAt, fixture.fixture, aspectPolicy, createImpedimentPolicy(options));

describe("impediment resource budgets and ownership", () => {
  it("preflights all third-contact scans without third provider calls and keeps static facts", () => {
    const fixture = law();
    const bodies: string[] = [];
    const longitudeAt: AspectLongitudeAt = (body, at) => { bodies.push(body); return fixture.longitudeAt(body, at); };
    const report = run({ ...fixture, longitudeAt }, { refranation: false, thirdPlanets: ["Mercury"], maxSamples: 1 });
    expect(report.search).toMatchObject({ status: "refused", reason: "sample-budget", samples: 0 });
    expect(bodies).not.toContain("Mercury");
    expect(bodies.length).toBe(2 * report.motion.aspects.search.samples);
    expect(report.contacts).toEqual([]);
    expect(rule(report, "prohibition")).toMatchObject({ status: "search-refused", evidence: [] });
    expect(report.applications[0]).toMatchObject({ aspect: { current: { motion: "applying" }, timeToPerfection: { elapsedDays: 6 } } });
  });
  it("counts calls across all pairs and probes, refuses late atomically, and respects the horizon", () => {
    const fixture = law();
    let calls = 0;
    const dates: number[] = [];
    const longitudeAt: AspectLongitudeAt = (body, at) => { calls++; dates.push(at.getTime()); return fixture.longitudeAt(body, at); };
    const speedAt: AspectSpeedAt = (body, at) => { calls++; dates.push(at.getTime()); return fixture.speedAt(body, at); };
    const full = run({ ...fixture, longitudeAt, speedAt }, { thirdPlanets: ["Mercury", "Saturn"] });
    expect(full.search.status).toBe("complete");
    expect(calls).toBe(2 * full.motion.aspects.search.samples + full.motion.eventSearch.samples + full.search.samples);
    expect(Math.min(...dates)).toBe(epoch);
    expect(Math.max(...dates)).toBe(epoch + 8 * DAY);
    const limit = full.search.samples - 1;
    calls = 0;
    const refused = run({ ...fixture, longitudeAt, speedAt }, { thirdPlanets: ["Mercury", "Saturn"], maxSamples: limit });
    expect(refused.search).toMatchObject({ status: "refused", reason: "sample-budget" });
    expect(refused.search.samples).toBeGreaterThan(0);
    expect(refused.search.samples).toBeLessThanOrEqual(limit);
    expect(calls).toBe(2 * refused.motion.aspects.search.samples + refused.motion.eventSearch.samples + refused.search.samples);
    expect(refused.contacts).toEqual([]);
    expect(refused.applications[0]!.observations.every(row => row.status === "search-refused" && row.evidence.length === 0)).toBe(true);
  });
  it("refuses station probes atomically without suppressing the independent base event report", () => {
    const fixture = impedimentFixture({ Venus: [t => 10 + 2 * t - t * t, t => 2 - 2 * t] });
    const report = run(fixture, { prohibition: false, frustration: false, maxSamples: 7 });
    expect(report.search).toMatchObject({ status: "refused", samples: 7 });
    expect(report.motion.eventSearch.status).toBe("complete");
    expect(report.motion.events.length).toBeGreaterThan(0);
    expect(rule(report, "refranation")).toMatchObject({ status: "search-refused", evidence: [] });
    const full = run(fixture, { prohibition: false, frustration: false });
    expect(full.search.samples).toBe(8);
    expect(rule(full, "refranation").status).toBe("candidate");
  });
  it("distinguishes station-scan refusal, principal-scan refusal and disabled searching", () => {
    const fixture = law();
    const station = run(fixture, { thirdPlanets: ["Mercury"], stationMaxSamples: 1 });
    expect(station.motion.eventSearch).toMatchObject({ status: "refused", samples: 0 });
    expect(rule(station, "refranation")).toMatchObject({ status: "event-search-refused", evidence: [] });
    expect(rule(station, "prohibition").status).toBe("candidate");
    const principal = run(fixture, {}, createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays: 8, maxSamples: 1 }));
    expect(principal.motion.aspects.search.status).toBe("refused");
    expect(principal.search.samples).toBe(0);
    expect(principal.applications[0]!.observations.every(row => row.status === "search-refused")).toBe(true);
    const disabled = run(fixture, {}, createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays: 8, search: false }));
    expect(disabled.applications[0]!.observations.every(row => row.status === "search-disabled")).toBe(true);
  });
  it("skips disabled motion checks, third inputs and all providers when every rule is disabled", () => {
    const fixture = law();
    const failure = () => { throw new Error("unexpected provider call"); };
    const allDisabled = run({ ...fixture, longitudeAt: failure, speedAt: failure }, { prohibition: false, frustration: false, refranation: false });
    expect(allDisabled.assessment).toBe("disabled");
    expect(allDisabled.applications[0]!.observations.every(row => row.status === "disabled" && row.source.tradition.includes("Lilly"))).toBe(true);
    const contactOnly = run({ ...fixture, speedAt: failure }, { refranation: false, thirdPlanets: ["Mercury"] });
    expect(rule(contactOnly, "prohibition").status).toBe("candidate");
    expect(rule(contactOnly, "refranation").status).toBe("disabled");
    const onlyStation = impedimentFixture({ Venus: [t => 10 + 2 * t - t * t, t => 2 - 2 * t] });
    onlyStation.fixture.chart.bodies.find(row => row.body === "Mercury")!.lon = NaN;
    expect(rule(run(onlyStation, { prohibition: false, frustration: false }), "refranation").status).toBe("candidate");
  });
  it("takes frozen JSON-friendly snapshots and gives every provider a fresh Date", () => {
    const fixture = law(), before = structuredClone(fixture.fixture);
    const longitudeAt: AspectLongitudeAt = (body, at) => { const value = fixture.longitudeAt(body, at); at.setTime(0); return value; };
    const speedAt: AspectSpeedAt = (body, at) => { const value = fixture.speedAt(body, at); at.setTime(0); return value; };
    const report = run({ ...fixture, longitudeAt, speedAt }, { thirdPlanets: ["Mercury"] });
    expect(rule(report, "prohibition").status).toBe("candidate");
    expect(fixture.fixture).toEqual(before);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    const frozen = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      expect(Object.isFrozen(value)).toBe(true);
      Object.values(value).forEach(frozen);
    };
    frozen(report);
    const snapshot = structuredClone(report);
    fixture.fixture.chart.bodies[0]!.lon = 359;
    fixture.fixture.chart.houses.cusps[0] = 180;
    expect(report).toEqual(snapshot);
    frozen(run(law(), { prohibition: false, frustration: false, refranation: false }));
  });
});

describe("impediment input and provider validation", () => {
  it("rejects duplicate/missing selected rows and invalid geometry or speed", () => {
    for (const invalid of ["missing", "duplicate", "longitude", "speed"] as const) {
      const fixture = law();
      const row = fixture.fixture.chart.bodies.find(row => row.body === "Mercury")!;
      if (invalid === "missing") fixture.fixture.chart.bodies = fixture.fixture.chart.bodies.filter(row => row.body !== "Mercury");
      if (invalid === "duplicate") fixture.fixture.chart.bodies.push({ ...row });
      if (invalid === "longitude") row.lon = 360;
      if (invalid === "speed") row.speed = NaN;
      expect(() => run(fixture, { thirdPlanets: ["Mercury"] })).toThrow(RangeError);
    }
    const ignored = law();
    ignored.fixture.chart.bodies.find(row => row.body === "Jupiter")!.speed = NaN;
    expect(run(ignored, { thirdPlanets: ["Mercury"] }).search.status).toBe("complete");
  });
  it("propagates provider errors and refuses invalid samples and policy snapshots", () => {
    for (const value of [-1, 360, NaN, Infinity, null, "0"]) {
      expect(() => run({ ...law(), longitudeAt: () => value as number })).toThrow(RangeError);
    }
    for (const value of [NaN, Infinity, null, "0"]) {
      expect(() => run({ ...law(), speedAt: () => value as number })).toThrow(RangeError);
    }
    const failure = new Error("provider failed");
    expect(() => run({ ...law(), longitudeAt: () => { throw failure; } })).toThrow(failure);
    expect(() => run({ ...law(), speedAt: null as never })).toThrow(RangeError);
    expect(() => run(law(), {}, { ...aspects, schema: "bad" } as never)).toThrow(RangeError);
  });
});
