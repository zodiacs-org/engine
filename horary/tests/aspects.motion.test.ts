import { describe, expect, it } from "vitest";
import { ASPECT_TYPES } from "../src/engine.js";
import { ASPECT_SEARCH_METHOD, createAspectSearchPolicy, evaluateSignificatorAspectsWith } from "../src/index.js";
import type { AspectLongitudeAt } from "../src/index.js";
import { aspectFixture, questionInput } from "./fixtures.js";

const epoch = Date.parse(questionInput.instant), DAY = 86_400_000;
const instant = (days: number) => new Date(epoch + days * DAY).toISOString();
const wrap = (value: number) => ((value % 360) + 360) % 360;
// Independent arithmetic: Mars a + as*t, Venus b + bs*t, Moon fixed at 180.
function linear(a = 0, b = 6, as = 1, bs = 0): AspectLongitudeAt {
  return (body, date) => {
    const t = (date.getTime() - epoch) / DAY;
    return wrap(body === "Mars" ? a + as * t : body === "Venus" ? b + bs * t : 180);
  };
}
const policy = (horizonDays = 8) => createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays,
  stepDays: 0.25, maxSamples: 2000 });

describe("independently solved motion through the unmodified engine crossing solver", () => {
  it("finds a moving-target conjunction rather than using a frozen target or linear timing estimate", () => {
    const calls: { body: string; at: number }[] = [];
    const law = linear(0, 6, 2, 1);
    const provider: AspectLongitudeAt = (body, date) => { calls.push({ body, at: date.getTime() }); return law(body, date); };
    const report = evaluateSignificatorAspectsWith(provider, aspectFixture(0, 6, 2, 1), policy());
    const item = report.aspects[0]!;
    // 2t = 6 + t gives t=6 days. Freezing Venus would wrongly give t=3.
    expect(item.contacts).toEqual([{ at: instant(6), elapsedDays: 6, directedLongitude: 0, relativeDirection: "increasing" }]);
    expect(item.timeToPerfection).toEqual({ kind: "candidate", at: instant(6), elapsedDays: 6, directedLongitude: 0 });
    expect(report.search).toMatchObject({ status: "complete", from: instant(0), to: instant(8), clock: "caller-longitude-provider" });
    expect(calls).toHaveLength(2 * report.search.samples);
    expect(Math.min(...calls.map(call => call.at))).toBe(epoch);
    expect(Math.max(...calls.map(call => call.at))).toBe(epoch + 8 * DAY);
  });

  it("includes the upper endpoint, excludes an exact question contact from future results, and bounds missing contacts", () => {
    const end = evaluateSignificatorAspectsWith(linear(), aspectFixture(), policy(6));
    expect(end.aspects[0]!.contacts[0]!.at).toBe(instant(6));
    const short = evaluateSignificatorAspectsWith(linear(), aspectFixture(), policy(5));
    expect(short.search.status).toBe("complete");
    expect(short.aspects[0]!.contacts).toEqual([]);
    expect(short.aspects[0]!.timeToPerfection).toBeNull();
    expect(short.aspects[0]!.explanation).toContain("in this horizon");
    const now = evaluateSignificatorAspectsWith(linear(0, 0), aspectFixture(0, 0), policy());
    expect(now.aspects[0]!.contacts).toEqual([]);
    expect(now.aspects[0]!.timeToPerfection).toEqual({ kind: "exact-now", at: instant(0), elapsedDays: 0, directedLongitude: 0 });
  });

  it("searches all directed branches of the major aspects using the same independently solved gap", () => {
    for (const [type, angle] of [["conjunction", 0], ["sextile", 60], ["square", 90], ["trine", 120], ["opposition", 180]] as const) {
      for (const side of [1, -1] as const) {
        const b = side === 1 ? wrap(6 - angle) : angle + 6;
        // a-b starts at side*angle - 6, increases one degree/day; contact is t=6.
        const item = evaluateSignificatorAspectsWith(linear(0, b), aspectFixture(0, b),
          createAspectSearchPolicy({ aspects: [type], orbs: { [type]: 8 }, horizonDays: 8, maxSamples: 2000 })).aspects[0]!;
        const directedLongitude = wrap(side * angle);
        expect(item.current).toMatchObject({ motion: "applying", withinOrb: true, directedLongitude });
        expect(item.contacts).toEqual([{ at: instant(6), elapsedDays: 6, directedLongitude, relativeDirection: "increasing" }]);
        expect(item.timeToPerfection).toMatchObject({ kind: "candidate", elapsedDays: 6 });
      }
    }
  });

  it("does not assign an unrelated future branch to a separating or out-of-orb application", () => {
    const law = linear(0, 55);
    const report = evaluateSignificatorAspectsWith(law, aspectFixture(0, 55), createAspectSearchPolicy({
      aspects: ["sextile"], orbs: { sextile: 8 }, horizonDays: 120, stepDays: 1, maxSamples: 2000
    }));
    // Separation starts at 55 (<60), shrinking, so sextile is separating; a-b reaches +60 at t=115.
    expect(report.aspects[0]!.current.motion).toBe("separating");
    expect(report.aspects[0]!.contacts).toEqual([{ at: instant(115), elapsedDays: 115, directedLongitude: 60, relativeDirection: "increasing" }]);
    expect(report.aspects[0]!.timeToPerfection).toBeNull();
    const outside = evaluateSignificatorAspectsWith(linear(0, 9), aspectFixture(0, 9), policy(10));
    expect(outside.aspects[0]!.contacts[0]!.elapsedDays).toBe(9);
    expect(outside.aspects[0]!.current.motion).toBe("applying");
    expect(outside.aspects[0]!.timeToPerfection).toBeNull();
  });

  it("retains nonlinear contacts and both relative directions through a reversal", () => {
    const law: AspectLongitudeAt = (body, date) => {
      const t = (date.getTime() - epoch) / DAY;
      return body === "Mars" ? 10 - (t - 2) ** 2 : body === "Venus" ? 9 : 180;
    };
    const item = evaluateSignificatorAspectsWith(law, aspectFixture(6, 9, 4), policy(4)).aspects[0]!;
    // 10-(t-2)^2=9 gives t=1 and 3; instantaneous 3/4 would be wrong.
    expect(item.contacts).toEqual([
      { at: instant(1), elapsedDays: 1, directedLongitude: 0, relativeDirection: "increasing" },
      { at: instant(3), elapsedDays: 3, directedLongitude: 0, relativeDirection: "decreasing" }
    ]);
    expect(item.timeToPerfection!.elapsedDays).toBe(1);
  });

  it("delegates hidden paired crossings near a turn and publishes the solver's limits", () => {
    const law: AspectLongitudeAt = (body, date) => {
      const t = (date.getTime() - epoch) / DAY;
      return body === "Mars" ? 9.0625 - (t - 0.5) ** 2 : body === "Venus" ? 9 : 180;
    };
    const report = evaluateSignificatorAspectsWith(law, aspectFixture(8.8125, 9, 1),
      createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays: 1, stepDays: 1, maxSamples: 2000 }));
    const contacts = report.aspects[0]!.contacts;
    expect(contacts).toHaveLength(2);
    // The endpoint offsets are both negative; roots at 1/4 and 3/4 are hidden in one step.
    const bound = Math.ceil(DAY / 2 ** 24) + 1; // Bisection bracket plus Date truncation, fixed before running.
    expect(Math.abs(Date.parse(contacts[0]!.at) - (epoch + DAY / 4))).toBeLessThanOrEqual(bound);
    expect(Math.abs(Date.parse(contacts[1]!.at) - (epoch + 3 * DAY / 4))).toBeLessThanOrEqual(bound);
    expect(contacts.map(contact => contact.relativeDirection)).toEqual(["increasing", "decreasing"]);
    expect(report.search.method).toEqual(ASPECT_SEARCH_METHOD);
    expect(report.search.method.verification).toBe("sampled;not-proven-complete");
  });

  it("refuses before coarse sampling when necessary and clears earlier branch/pair results on refinement refusal", () => {
    let calls = 0;
    const provider: AspectLongitudeAt = (body, date) => { calls++; return linear()(body, date); };
    const preflight = evaluateSignificatorAspectsWith(provider, aspectFixture(), createAspectSearchPolicy({ maxSamples: 1 }));
    expect(preflight.search).toMatchObject({ status: "refused", reason: "sample-budget", samples: 0 });
    expect(calls).toBe(0);
    const late = evaluateSignificatorAspectsWith(linear(0, 6.125), aspectFixture(0, 6.125),
      createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays: 8, stepDays: 0.25, maxSamples: 58 }));
    // First pair: 33 coarse evaluations + 24 refinements, leaving too little for the next pair.
    expect(late.search).toMatchObject({ status: "refused", samples: 57 });
    expect(late.aspects.every(item => item.contacts.length === 0 && item.timeToPerfection === null)).toBe(true);
    const refinement = evaluateSignificatorAspectsWith(linear(0, 6.125), aspectFixture(0, 6.125),
      createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays: 8, stepDays: 0.25, maxSamples: 34 }));
    expect(refinement.search).toMatchObject({ status: "refused", samples: 34 });
    expect(refinement.aspects.every(item => item.contacts.length === 0)).toBe(true);
  });

  it("never exceeds the global budget even across all pairs and branches", () => {
    let calls = 0;
    const report = evaluateSignificatorAspectsWith((body, date) => { calls++; return linear()(body, date); }, aspectFixture(),
      createAspectSearchPolicy({ aspects: ASPECT_TYPES, horizonDays: 8, maxSamples: 100 }));
    expect(report.search.status).toBe("refused");
    expect(report.search.samples).toBeLessThanOrEqual(100);
    expect(calls).toBe(2 * report.search.samples);
    expect(report.aspects.every(item => item.contacts.length === 0)).toBe(true);
  });

  it("propagates invalid provider data and provider errors rather than claiming no contacts", () => {
    for (const value of [NaN, Infinity, -1, 360]) {
      expect(() => evaluateSignificatorAspectsWith(() => value, aspectFixture(), policy())).toThrow(RangeError);
    }
    const failure = new RangeError("Out of provider span");
    expect(() => evaluateSignificatorAspectsWith(() => { throw failure; }, aspectFixture(), policy())).toThrow(failure);
  });
});
