import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BodyName } from "../../src/types.js";

// Invented linear motion, independently solved in fixtures.md. Only the
// ephemeris provider is mocked: the production ingress/aspect/window scanner
// and engine crossing solver run unchanged.
const motion = vi.hoisted(() => ({ epoch: Date.parse("2000-01-01T12:00:00Z"),
  day: 86_400_000, sun: 27, sunSpeed: 0, sampledTimes: [] as number[], sampledBodies: new Set<string>() }));
vi.mock("../../src/ephemeris.js", () => ({
  bodyLongitude(body: BodyName, at: Date) {
    const time = at.getTime();
    motion.sampledTimes.push(time);
    motion.sampledBodies.add(body);
    const lon = body === "Moon" ? 12 * (time - motion.epoch) / motion.day
      : body === "Sun" ? motion.sun + motion.sunSpeed * (time - motion.epoch) / motion.day
        : body === "Uranus" ? 29 : 45;
    return ((lon % 360) + 360) % 360;
  }
}));

import { CONSIDERATION_RULE_IDS, MOON_VOID_SCAN_METHOD, createRulePolicy,
  evaluateConsiderations, normalizeHoraryInput } from "../src/index.js";
import type { HoraryCast } from "../src/index.js";
import { voidOfCourseAt } from "../src/engine.js";
import { questionInput, schematicChart } from "./fixtures.js";

const onlyVoid = createRulePolicy({ rules: Object.fromEntries(
  CONSIDERATION_RULE_IDS.map((id) => [id, id === "moon-void-of-course"])
) });
const instant = (days: number) => new Date(motion.epoch + days * motion.day).toISOString();
function observe(days: number) {
  const chart = schematicChart();
  const result: HoraryCast = { schema: "horary.cast/v1",
    input: normalizeHoraryInput({ ...questionInput, instant: instant(days) }),
    chart: { ...chart, angles: chart.angles!, houses: chart.houses! } };
  return evaluateConsiderations(result, onlyVoid).observations.at(-1)!;
}

beforeEach(() => { motion.sun = 27; motion.sunSpeed = 0; motion.sampledTimes = []; motion.sampledBodies.clear(); });

describe("hand-derived lunar motion through the real engine scanner", () => {
  it("starts at the last exact contact and excludes sign exit", () => {
    expect(observe(2).status).toBe("not-triggered"); // Moon 24, still applying to Sun 27.
    const last = observe(2.25); // Moon 27: conjunction is exact, so the void starts here.
    expect(last.status).toBe("triggered");
    expect(last.scan!.current).toEqual({ from: instant(2.25), to: instant(2.5),
      sign: "aries", nextSign: "taurus", startBasis: "last-exact-aspect",
      lastAspect: { at: instant(2.25), body: "Sun", aspect: "conjunction", moonLongitude: 27 } });
    expect(observe(2.375).status).toBe("triggered");
    const exit = observe(2.5); // Moon 30: now Taurus, applying to the group at 45.
    expect(exit.status).toBe("not-triggered");
    expect(exit.scan!.current).toBeNull();
    expect(exit.scan!.next!.sign).toBe("taurus");
    expect(exit.scan!.next!.from).toBe(instant(3.75));
  });

  it("excludes outer planets even when they perfect later in the same sign", () => {
    const traditional = observe(2.375); // Moon 28.5; Uranus conjunction at 29 is still ahead.
    expect(traditional.status).toBe("triggered");
    expect([...motion.sampledBodies].sort()).toEqual(["Jupiter", "Mars", "Mercury", "Moon", "Saturn", "Sun", "Venus"]);
    expect(voidOfCourseAt(instant(2.375), { bodies: "modern" }).isVoid).toBe(false);
  });

  it("starts a sign with no qualifying contacts at ingress, including the Aries wrap", () => {
    motion.sun = 45;
    const item = observe(1.25); // Moon 15; nearest contact to every classical body is at 45.
    expect(item.status).toBe("triggered");
    expect(item.scan!.current).toEqual({ from: instant(0), to: instant(2.5),
      sign: "aries", nextSign: "taurus", startBasis: "sign-ingress", lastAspect: null });
    expect(observe(0).scan!.current!.from).toBe(instant(0));
    expect(observe(2.5).status).toBe("not-triggered");
  });

  it("does not use a contact exactly at the ending ingress for the sign being left", () => {
    motion.sun = 30;
    const before = observe(2.25);
    expect(before.status).toBe("triggered");
    expect(before.scan!.current).toEqual({ from: instant(0), to: instant(2.5),
      sign: "aries", nextSign: "taurus", startBasis: "sign-ingress", lastAspect: null });
    expect(observe(2.5).status).toBe("not-triggered");
  });

  it("recognizes all directed branches of the five selected aspect types", () => {
    // Sun's longitude minus each literal aspect angle reaches 27 in Aries.
    for (const [sun, aspect] of [[27, "conjunction"], [87, "sextile"], [117, "square"],
      [147, "trine"], [207, "opposition"], [327, "sextile"], [297, "square"], [267, "trine"]] as const) {
      motion.sun = sun;
      const last = observe(2.375).scan!.current!.lastAspect!;
      expect(last).toMatchObject({ body: "Sun", aspect });
      // The ingress solver's grid can place the start one millisecond late.
      // This bound comes from step / 2^24 plus Date truncation, not engine output.
      expect(Math.abs(Date.parse(last.at) - Date.parse(instant(2.25)))).toBeLessThanOrEqual(2);
      expect(Math.abs(last.moonLongitude - 27)).toBeLessThanOrEqual(12 * 2 / motion.day);
    }
  });

  it("uses the moving planet's longitude rather than freezing it at the question", () => {
    motion.sun = 24.75;
    motion.sunSpeed = 1;
    // 12t = 24.75 + t, so the conjunction is at t = 2.25 days, longitude 27.
    expect(observe(2).status).toBe("not-triggered");
    expect(observe(2.25).scan!.current!.lastAspect).toEqual({
      at: instant(2.25), body: "Sun", aspect: "conjunction", moonLongitude: 27
    });
  });

  it("exposes the fixed horizon and sampled search limitations", () => {
    const item = observe(2.25);
    const method = item.scan!.method;
    expect(method).toEqual(MOON_VOID_SCAN_METHOD);
    expect(method).toMatchObject({ verification: "sampled;not-proven-complete",
      ingressStepHours: 6, aspectStepHours: 3, ingressBisections: 24, aspectBisections: 26,
      lookBackDays: 7, lookAheadDays: 6, interval: "[last-exact-aspect-or-ingress,next-ingress)" });
    expect(Math.min(...motion.sampledTimes)).toBe(Date.parse(item.scan!.sampledFrom));
    expect(Math.max(...motion.sampledTimes)).toBe(Date.parse(item.scan!.sampledTo));
    expect(method.limitations.join(" ")).toContain("no caller-controlled sample budget");
    expect(method.limitations.join(" ")).toContain("status may shift");
  });
});
