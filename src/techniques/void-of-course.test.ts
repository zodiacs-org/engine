import { describe, expect, it } from "vitest";
import { bodyLongitude } from "../ephemeris.js";
import { SIGN_NAMES } from "../signs.js";
import {
  VOID_BODIES,
  VOID_OF_COURSE_CONVENTION,
  VOID_OF_COURSE_MAX_DAYS,
  moonAspects,
  moonIngresses,
  voidOfCourseAt,
  voidOfCourseWindows
} from "./void-of-course.js";

const DAY = 86_400_000;
const ANGLES: Record<string, number> = { conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 };
const from = new Date("2026-09-01T00:00:00Z");
const to = new Date("2026-10-15T00:00:00Z");
const signed = (a: number, b: number) => {
  const d = (((b - a) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
};

describe("the convention", () => {
  it("is named, with its aspects, bodies and source", () => {
    expect(VOID_OF_COURSE_CONVENTION).toEqual({
      name: "last-exact-ptolemaic-aspect-to-sign-exit",
      aspects: ["conjunction", "sextile", "square", "trine", "opposition"],
      defaultBodies: "modern",
      source: "Lilly, Christian Astrology (1647), p. 112"
    });
    expect(VOID_BODIES.modern).toEqual(["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]);
    expect(VOID_BODIES.traditional).toEqual(["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"]);
    expect(Object.isFrozen(VOID_OF_COURSE_CONVENTION) && Object.isFrozen(VOID_BODIES.modern)).toBe(true);
  });
});

describe("the void-of-course Moon", () => {
  const ingresses = moonIngresses(from, to);
  const aspects = moonAspects(from, to);
  const windows = voidOfCourseWindows(from, to);

  it("finds each ingress as the Moon's longitude crossing a multiple of 30°", () => {
    expect(ingresses.length).toBeGreaterThan(15);
    ingresses.forEach((ingress, index) => {
      const lon = bodyLongitude("Moon", ingress.at);
      expect(Math.abs(signed(SIGN_NAMES.indexOf(ingress.sign) * 30, lon))).toBeLessThan(1e-6);
      if (index > 0) expect(SIGN_NAMES.indexOf(ingress.sign)).toBe((SIGN_NAMES.indexOf(ingresses[index - 1]!.sign) + 1) % 12);
    });
  });

  it("perfects every reported aspect, in time order", () => {
    expect(aspects.length).toBeGreaterThan(100);
    for (const aspect of aspects) {
      const separation = signed(bodyLongitude(aspect.body, aspect.at), bodyLongitude("Moon", aspect.at));
      expect(Math.abs(Math.abs(separation) - ANGLES[aspect.aspect]!)).toBeLessThan(1e-4);
      expect(Math.abs(signed(aspect.moonLon, bodyLongitude("Moon", aspect.at)))).toBeLessThan(1e-9);
    }
    for (let i = 1; i < aspects.length; i += 1) expect(aspects[i]!.at.getTime()).toBeGreaterThanOrEqual(aspects[i - 1]!.at.getTime());
  });

  it("misses no aspect: a sweep every 30 minutes finds a reported one in every crossing", () => {
    const sweepFrom = new Date("2026-09-10T00:00:00Z").getTime();
    const sweepTo = new Date("2026-09-20T00:00:00Z").getTime();
    const found = moonAspects(sweepFrom, sweepTo);
    const types: Record<number, string> = {
      0: "conjunction", 60: "sextile", 300: "sextile", 90: "square", 270: "square", 120: "trine", 240: "trine", 180: "opposition"
    };
    const typeOf = (offset: number) => types[offset];
    for (const body of VOID_BODIES.modern) {
      for (const offset of Object.keys(types).map(Number)) {
        let prevT = sweepFrom;
        let prev = signed(bodyLongitude(body, new Date(prevT)) + offset, bodyLongitude("Moon", new Date(prevT)));
        while (prevT < sweepTo) {
          const t = prevT + DAY / 48;
          const cur = signed(bodyLongitude(body, new Date(t)) + offset, bodyLongitude("Moon", new Date(t)));
          if (Math.sign(cur) !== Math.sign(prev) && Math.abs(cur) < 90 && Math.abs(prev) < 90 && cur !== 0 && prev !== 0) {
            const hit = found.find((a) => a.body === body && a.aspect === typeOf(offset) && a.at.getTime() > prevT && a.at.getTime() <= t);
            expect(hit, `${body} ${offset}° near ${new Date(t).toISOString()}`).toBeTruthy();
          }
          prevT = t;
          prev = cur;
        }
      }
    }
  }, 60_000);

  it("runs each window from the last aspect in a sign to the next ingress", () => {
    const ending = ingresses.filter((ingress) => ingress.at > from);
    expect(windows).toHaveLength(ending.length);
    windows.forEach((window, index) => {
      expect(window.to.getTime()).toBe(ending[index]!.at.getTime());
      expect(window.nextSign).toBe(ending[index]!.sign);
      expect(SIGN_NAMES.indexOf(window.sign)).toBe((SIGN_NAMES.indexOf(window.nextSign) + 11) % 12);
      expect(window.from.getTime()).toBeLessThan(window.to.getTime());
      if (window.lastAspect) {
        expect(window.from.getTime()).toBe(window.lastAspect.at.getTime());
        expect(aspects.filter((a) => a.at > window.lastAspect!.at && a.at < window.to)).toHaveLength(0);
      }
      expect(window.to.getTime() - window.from.getTime()).toBeLessThan(2.8 * DAY);
    });
  });

  it("starts traditional voids no later than modern ones", () => {
    const end = new Date("2026-09-30T00:00:00Z");
    const traditional = voidOfCourseWindows(from, end, { bodies: "traditional" });
    const modern = windows.filter((window) => window.to <= end);
    expect(traditional).toHaveLength(modern.length);
    traditional.forEach((window, index) => {
      expect(window.to.getTime()).toBe(modern[index]!.to.getTime());
      expect(window.from.getTime()).toBeLessThanOrEqual(modern[index]!.from.getTime());
    });
  });

  it("answers whether the Moon is void at an instant, consistently with the windows", () => {
    const inside = windows[3]!;
    const middle = new Date((inside.from.getTime() + inside.to.getTime()) / 2);
    const status = voidOfCourseAt(middle);
    expect(status.isVoid).toBe(true);
    // Scans that start at different instants bisect on different grids: within a second.
    expect(Math.abs(status.current!.from.getTime() - inside.from.getTime())).toBeLessThan(1000);
    expect(Math.abs(status.current!.to.getTime() - inside.to.getTime())).toBeLessThan(1000);
    expect(Math.abs(status.next!.from.getTime() - windows[4]!.from.getTime())).toBeLessThan(1000);
    const after = voidOfCourseAt(new Date(inside.to.getTime() + 60_000));
    expect(after.isVoid).toBe(false);
    expect(after.current).toBeNull();
  });

  it("refuses inverted, overlong and unknown input", () => {
    expect(() => voidOfCourseWindows(to, from)).toThrow(RangeError);
    expect(() => moonIngresses(from, from.getTime() + (VOID_OF_COURSE_MAX_DAYS + 1) * DAY)).toThrow(RangeError);
    expect(() => voidOfCourseWindows(from, to, { bodies: "classical" as never })).toThrow(RangeError);
    expect(() => voidOfCourseAt(from, { orbs: true } as never)).toThrow(RangeError);
    expect(moonIngresses(from, from)).toEqual([]);
  });
});
