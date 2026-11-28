import { describe, expect, it } from "vitest";
import { createAspectSearchPolicy, createDirectPerfectionPolicy, DIRECT_EVENT_METHOD, DIRECT_PERFECTION_SOURCE,
  evaluateDirectPerfectionWith } from "../src/index.js";
import type { AspectLongitudeAt, AspectSpeedAt, HoraryDirectPolicy } from "../src/index.js";
import { aspectFixture, questionInput } from "./fixtures.js";

const epoch = Date.parse(questionInput.instant), DAY = 86_400_000;
const instant = (t: number) => new Date(epoch + t * DAY).toISOString();
const wrap = (n: number) => ((n % 360) + 360) % 360;
type Law = (t: number) => number;
function providers(a: Law, b: Law, as: Law, bs: Law, moon: Law = () => 180, ms: Law = () => 0) {
  const longitudeAt: AspectLongitudeAt = (body, at) => wrap((body === "Mars" ? a : body === "Venus" ? b : moon)((at.getTime() - epoch) / DAY));
  const speedAt: AspectSpeedAt = (body, at) => (body === "Mars" ? as : body === "Venus" ? bs : ms)((at.getTime() - epoch) / DAY);
  return { longitudeAt, speedAt };
}
const aspectPolicy = (horizonDays = 8, maxSamples = 2000) => createAspectSearchPolicy({ aspects: ["conjunction"],
  horizonDays, stepDays: 0.25, maxSamples });
const linear = () => providers(t => 10 + 2 * t, t => 16 + t, () => 2, () => 1);
function run(law = linear(), fixture = aspectFixture(10, 16, 2, 1), horizonDays = 8,
  policy = createDirectPerfectionPolicy()) {
  return evaluateDirectPerfectionWith(law.longitudeAt, law.speedAt, fixture, aspectPolicy(horizonDays), policy);
}

describe("direct perfection policy snapshots", () => {
  it("sets tested resource defaults and independent toggleable checks", () => {
    expect(createDirectPerfectionPolicy()).toEqual({ schema: "horary.direct-policy/v1", directAspect: true,
      signChanges: true, stations: true, maxSamples: 20_000 });
    expect(createDirectPerfectionPolicy({ directAspect: false, signChanges: false, stations: false, maxSamples: 1_000_000 }))
      .toMatchObject({ directAspect: false, signChanges: false, stations: false, maxSamples: 1_000_000 });
    expect(DIRECT_PERFECTION_SOURCE.tradition).toContain("Lilly");
    expect(DIRECT_EVENT_METHOD.verification).toBe("sampled;not-proven-complete");
  });
  it.each([null, [], { extra: true }, { stations: null }, { signChanges: "yes" }, { directAspect: 0 },
    { maxSamples: 0 }, { maxSamples: 1.5 }, { maxSamples: Infinity }, { maxSamples: NaN }, { maxSamples: 1_000_001 }])(
    "rejects malformed options %j", options => {
      expect(() => createDirectPerfectionPolicy(options as never)).toThrow(RangeError);
    });
  it("rejects non-data slots without executing accessors and incomplete restored snapshots", () => {
    let calls = 0;
    expect(() => createDirectPerfectionPolicy({ get stations() { calls++; return true; } })).toThrow(RangeError);
    expect(calls).toBe(0);
    const law = linear(), fixture = aspectFixture(10, 16, 2, 1);
    const policy = createDirectPerfectionPolicy();
    for (const bad of [{ ...policy, schema: "other" }, { ...policy, stations: undefined },
      { ...policy, maxSamples: 0 }, { schema: policy.schema }, Object.create(policy)]) {
      expect(() => evaluateDirectPerfectionWith(law.longitudeAt, law.speedAt, fixture, aspectPolicy(), bad as HoraryDirectPolicy))
        .toThrow(RangeError);
    }
    expect(run(law, fixture, 8, JSON.parse(JSON.stringify(policy))).policy).toEqual(policy);
  });
});

describe("independently derived direct contact and ordered continuity evidence", () => {
  it("recognizes a moving-target direct contact with no earlier sign change or station", () => {
    const report = run();
    expect(report.direct[0]).toMatchObject({ kind: "direct-aspect", status: "direct-contact", candidate: {
      at: instant(6), elapsedDays: 6, directedLongitude: 0 }, events: [] });
    expect(report.eventSearch).toMatchObject({ status: "complete", clock: "caller-motion-providers", from: instant(0), to: instant(8) });
    expect(report.direct[0]!.explanation).toContain("partial direct-perfection evidence");
    expect(report.events).toEqual([]);
  });

  it("flags an ingress before a later contact and preserves every ordered event, including unrelated lunar evidence", () => {
    // Mars=28+2t, Venus=34+t, contact t=6. Mars crosses 30 at t=1.
    const law = providers(t => 28 + 2 * t, t => 34 + t, () => 2, () => 1, t => 180 + 12 * t, () => 12);
    const fixture = aspectFixture(28, 34, 2, 1);
    fixture.chart.bodies.find(row => row.body === "Moon")!.speed = 12;
    const report = run(law, fixture);
    expect(report.direct[0]).toMatchObject({ status: "interrupted", candidate: { elapsedDays: 6 }, events: [{
      relation: "before", event: { kind: "sign-boundary", at: instant(1), planet: { planet: "Mars" },
        longitude: 30, fromSign: "aries", toSign: "taurus", transition: "change" }
    }] });
    expect(report.events.map(event => event.elapsedDays)).toEqual([1, 2.5, 5, 7.5]);
    expect(report.events.slice(1).every(event => event.planet.planet === "Moon")).toBe(true);
    expect(report.direct[0]!.events.every(({ event }) => event.planet.planet !== "Moon")).toBe(true);
  });

  it("retains forward and retrograde zero-degree boundary changes", () => {
    for (const [a, b, as, bs, beforeSign, afterSign] of [[358, 4, 2, 1, "pisces", "aries"],
      [2, 356, -2, -1, "aries", "pisces"]] as const) {
      const law = providers(t => a + as * t, t => b + bs * t, () => as, () => bs);
      const report = run(law, aspectFixture(a, b, as, bs));
      expect(report.events.find(event => event.planet.planet === "Mars")).toMatchObject({
        kind: "sign-boundary", at: instant(1), longitude: 0, fromSign: beforeSign, toSign: afterSign, transition: "change" });
      expect(report.direct[0]!.status).toBe("interrupted");
      expect(report.direct[0]!.candidate!.elapsedDays).toBe(6);
    }
  });

  it("does not invent an order for ingress at the contact", () => {
    const report = run(providers(t => 24 + t, () => 30, () => 1, () => 0), aspectFixture(24, 30), 8);
    expect(report.direct[0]).toMatchObject({ status: "requires-review", candidate: { elapsedDays: 6 }, events: [{
      relation: "coincident", event: { kind: "sign-boundary", elapsedDays: 6, planet: { planet: "Mars" } }
    }] });
    expect(report.eventSearch.rootResolutionMs).toBe(Math.ceil(0.25 * DAY / 2 ** 24) + 1);
  });

  it("finds both planets' stations before a contact from quadratic motion without assuming refrenation", () => {
    // a=10+2t-t^2, b=16+t-2t^2 => a-b=t^2+t-6=(t-2)(t+3).
    const law = providers(t => 10 + 2 * t - t * t, t => 16 + t - 2 * t * t, t => 2 - 2 * t, t => 1 - 4 * t);
    const report = run(law, aspectFixture(10, 16, 2, 1), 3);
    expect(report.direct[0]).toMatchObject({ status: "interrupted", candidate: { elapsedDays: 2 } });
    expect(report.events).toMatchObject([
      { kind: "station", at: instant(0.25), planet: { planet: "Venus" }, fromMotion: "direct", toMotion: "retrograde", transition: "reversal" },
      { kind: "station", at: instant(1), planet: { planet: "Mars" }, fromMotion: "direct", toMotion: "retrograde", transition: "reversal" }
    ]);
    expect(report.direct[0]!.events.map(row => row.relation)).toEqual(["before", "before"]);
    expect(report.events.every(event => event.explanation.includes("does not establish refrenation"))).toBe(true);
  });

  it("preserves a station coincident with contact and the unresolved horizon endpoint", () => {
    const law = providers(t => 10 - (t - 2) ** 2, () => 10, t => 4 - 2 * t, () => 0);
    const report = run(law, aspectFixture(6, 10, 4), 4);
    expect(report.direct[0]).toMatchObject({ status: "requires-review", candidate: { elapsedDays: 2 }, events: [{
      relation: "coincident", event: { kind: "station", transition: "reversal", elapsedDays: 2 } }] });
    const end = run(law, aspectFixture(6, 10, 4), 2);
    expect(end.events[0]).toMatchObject({ kind: "station", at: instant(2), transition: "unresolved" });
    expect(end.direct[0]!.status).toBe("requires-review");
    expect(end.events[0]!.evidence.beforeAt).not.toBe(instant(2));
    expect(end.events[0]!.evidence.afterAt).toBe(instant(2));
  });

  it("keeps station touches and sign-boundary tangencies distinct from confirmed changes", () => {
    const station = run(providers(t => 10 + (t - 1) ** 3 / 3 + 1 / 3, () => 16,
      t => (t - 1) ** 2, () => 0), aspectFixture(10, 16), 4);
    expect(station.events[0]).toMatchObject({ kind: "station", elapsedDays: 1, transition: "touch",
      fromMotion: "direct", toMotion: "direct" });
    expect(station.direct[0]!.status).toBe("requires-review");
    const boundary = run(providers(t => 30 - (t - 1) ** 2, () => 35, t => 2 - 2 * t, () => 0),
      aspectFixture(29, 35, 2), 2);
    expect(boundary.events.find(event => event.kind === "sign-boundary")).toMatchObject({
      elapsedDays: 1, transition: "touch", fromSign: "aries", toSign: "aries" });
    expect(boundary.direct[0]!.status).toBe("contact-not-found");
  });

  it("preserves a sign exit followed by reentry even when both endpoints share a sign", () => {
    const law = providers(t => 31 - (t - 2) ** 2, () => 34, t => 4 - 2 * t, () => 0);
    const report = run(law, aspectFixture(27, 34, 4), 4);
    expect(report.events).toMatchObject([
      { kind: "sign-boundary", elapsedDays: 1, fromSign: "aries", toSign: "taurus", transition: "change" },
      { kind: "station", elapsedDays: 2, transition: "reversal" },
      { kind: "sign-boundary", elapsedDays: 3, fromSign: "taurus", toSign: "aries", transition: "change" }
    ]);
  });

  it("recognizes open-start boundary departures rather than declaring unchanged signs", () => {
    const report = run(providers(t => 30 - t, () => 24, () => -1, () => 0), aspectFixture(30, 24, -1), 8);
    expect(report.events[0]).toMatchObject({ kind: "sign-boundary", elapsedDays: 0, fromSign: "taurus",
      toSign: "aries", transition: "unresolved" });
    expect(report.direct[0]!.status).toBe("requires-review");
    const zero = run(providers(t => 10 + t * t, () => 16, t => 2 * t, () => 0), aspectFixture(10, 16, 0), 4);
    expect(zero.events[0]).toMatchObject({ kind: "station", elapsedDays: 0, fromMotion: "zero", toMotion: "direct", transition: "unresolved" });
  });

  it("ignores events after contact for continuity, even when the horizon contains an ingress", () => {
    const report = run(linear(), aspectFixture(10, 16, 2, 1), 12);
    expect(report.events).toMatchObject([{ kind: "sign-boundary", planet: { planet: "Mars" }, elapsedDays: 10 }]);
    expect(report.direct[0]).toMatchObject({ status: "direct-contact", candidate: { elapsedDays: 6 }, events: [] });
  });

  it("supports each major aspect on both branches as partial direct contact evidence", () => {
    for (const [type, angle] of [["conjunction", 0], ["sextile", 60], ["square", 90], ["trine", 120], ["opposition", 180]] as const) {
      for (const side of [1, -1]) {
        const b = wrap(16 - side * angle);
        const law = providers(t => 10 + 2 * t, t => b + t, () => 2, () => 1);
        const report = evaluateDirectPerfectionWith(law.longitudeAt, law.speedAt, aspectFixture(10, b, 2, 1),
          createAspectSearchPolicy({ aspects: [type], horizonDays: 8, orbs: { [type]: 8 } }));
        expect(report.direct[0]).toMatchObject({ type, status: "direct-contact", candidate: { elapsedDays: 6 } });
      }
    }
  });

  it("keeps exact-now, separating, stationary, out-of-orb and bounded missing-contact states explicit", () => {
    expect(run(providers(t => 10 + t, () => 10, () => 1, () => 0), aspectFixture(10, 10)).direct[0]!.status).toBe("exact-now");
    expect(run(providers(t => 16 + t, () => 10, () => 1, () => 0), aspectFixture(16, 10)).direct[0]!.status).toBe("no-current-application");
    expect(run(providers(() => 10, () => 16, () => 0, () => 0), aspectFixture(10, 16, 0)).direct[0]!.status).toBe("no-current-application");
    expect(run(providers(t => 10 + t, () => 19, () => 1, () => 0), aspectFixture(10, 19), 10).direct[0]!.status).toBe("no-current-application");
    expect(run(linear(), aspectFixture(10, 16, 2, 1), 5).direct[0]!.status).toBe("contact-not-found");
  });

  it("applies independent toggles and records the disabled checks", () => {
    const law = providers(t => 28 + 2 * t, t => 34 + t, () => 2, () => 1);
    const report = run(law, aspectFixture(28, 34, 2, 1), 8, createDirectPerfectionPolicy({ signChanges: false }));
    expect(report.direct[0]!.status).toBe("direct-contact");
    expect(report.direct[0]!.explanation).toContain("Sign-change checking is disabled");
    expect(report.events).toEqual([]);
    let speedCalls = 0;
    const both = evaluateDirectPerfectionWith(law.longitudeAt, () => { speedCalls++; return NaN; }, aspectFixture(28, 34, 2, 1),
      aspectPolicy(), createDirectPerfectionPolicy({ signChanges: false, stations: false }));
    expect(both.eventSearch).toMatchObject({ status: "disabled", samples: 0 });
    expect(both.direct[0]!.status).toBe("direct-contact");
    expect(speedCalls).toBe(0);
    const disabled = run(law, aspectFixture(28, 34, 2, 1), 8, createDirectPerfectionPolicy({ directAspect: false }));
    expect(disabled.direct.every(row => row.status === "disabled" && row.candidate === null && row.events.length === 0)).toBe(true);
    expect(disabled.events).toHaveLength(1);
  });

  it("retains shared roles without creating self contacts, and freezes independent snapshots", () => {
    const fixture = aspectFixture(10, 16, 2, 1);
    fixture.chart.houses.cusps[1] = 20; // Aries second house shares Mars with the first.
    const report = run(linear(), fixture);
    expect(report.aspects.significators.planets[0]).toMatchObject({ planet: "Mars", shared: true, roles: ["querent", "quesited"] });
    expect(report.direct.every(row => row.a.planet !== row.b.planet)).toBe(true);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.direct[0]!.events)).toBe(true);
    expect(Object.isFrozen(report.policy)).toBe(true);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    const eventFixture = aspectFixture(28, 34, 2, 1);
    const withEvents = run(providers(t => 28 + 2 * t, t => 34 + t, () => 2, () => 1), eventFixture);
    expect(Object.isFrozen(withEvents.events[0]!.evidence)).toBe(true);
    const before = structuredClone(withEvents);
    eventFixture.chart.bodies[0]!.lon = 359;
    eventFixture.chart.houses.cusps[0] = 180;
    expect(withEvents).toEqual(before);
  });
});
