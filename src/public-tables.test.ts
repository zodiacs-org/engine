import { describe, expect, it } from "vitest";

import {
  ASPECTS,
  ASPECT_BODIES,
  ASPECT_TYPES,
  ELEMENTS,
  HOUSE_SYSTEMS,
  LOTS,
  MODALITIES,
  POLAR_UNDEFINED_HOUSE_SYSTEMS,
  SIGNS,
  SIGN_NAMES,
  SIGN_SLUGS,
  natalChart
} from "./index.js";
import { CALC_AYANAMSAS, CALC_BODIES, CALC_FRAMES, calc } from "./calc.js";
import { deltaT, deltaTAt } from "./deltat.js";
import { AYANAMSAS } from "./vedic.js";

/** Every array, and every object in one, frozen all the way down. */
function deeplyFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen);
}

describe("the tables the entry points export", () => {
  it("are frozen, so that no caller can change what the engine reads", () => {
    const tables = { ASPECTS, ASPECT_TYPES, ELEMENTS, HOUSE_SYSTEMS, LOTS, MODALITIES, POLAR_UNDEFINED_HOUSE_SYSTEMS, SIGNS, SIGN_SLUGS, CALC_AYANAMSAS, CALC_BODIES, CALC_FRAMES };
    for (const [name, table] of Object.entries(tables)) expect(deeplyFrozen(table), name).toBe(true);
    expect(() => (CALC_BODIES as string[]).push("Chiron")).toThrow(TypeError);
    expect(() => {
      (SIGNS[0] as { slug: string }).slug = "ram";
    }).toThrow(TypeError);
    expect(calc({ body: "Sun", time: "2000-01-01T12:00:00Z", frame: "ecliptic-j2000" }).status).toBe("ok");
  });

  it("give calc the ayanamsas vedic has, in its order", () => {
    expect(CALC_AYANAMSAS).toEqual(["lahiri", "fagan-bradley", "krishnamurti", "raman", "yukteswar", "true-chitra", "true-revati", "true-pushya", "galactic-center"]);
    expect(CALC_AYANAMSAS).toEqual(Object.keys(AYANAMSAS));
  });

  it("keep the aspect bodies the engine reads apart from the public set, which a caller can still mutate", () => {
    const chart = () => natalChart({ utc: "2001-12-21T09:00:00Z", latitude: 40, longitude: -3, houseSystem: "placidus" });
    const before = chart().aspects;
    const shared = ASPECT_BODIES as Set<string>;
    shared.delete("Sun");
    try {
      expect(chart().aspects).toEqual(before);
    } finally {
      shared.add("Sun");
    }
    expect(before.some((aspect) => aspect.a === "Sun" || aspect.b === "Sun")).toBe(true);
  });

  it("name the signs by slug, and keep SIGN_NAMES, deprecated, as the same list", () => {
    expect(SIGN_SLUGS).toEqual(SIGNS.map((sign) => sign.slug));
    expect(SIGN_SLUGS[0]).toBe("aries");
    expect(SIGN_NAMES).toBe(SIGN_SLUGS);
  });
});

describe("ΔT at an instant that is no number", () => {
  it("is refused with a RangeError rather than returned as NaN", () => {
    for (const ut of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "0" as unknown as number]) {
      expect(() => deltaT(ut), String(ut)).toThrow(RangeError);
      expect(() => deltaTAt(ut), String(ut)).toThrow(RangeError);
    }
    expect(Number.isFinite(deltaT(0))).toBe(true);
  });
});
