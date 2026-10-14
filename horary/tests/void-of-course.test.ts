import { afterEach, describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { CONSIDERATION_RULE_IDS, MOON_VOID_SCAN_METHOD, createRulePolicy,
  evaluateConsiderations, normalizeHoraryInput } from "../src/index.js";
import type { HoraryCast } from "../src/index.js";
import { questionInput, schematicChart } from "./fixtures.js";

const noon = new Date("2000-01-01T12:00:00Z");

function fixture(): HoraryCast {
  const chart = schematicChart();
  return { schema: "horary.cast/v1", input: normalizeHoraryInput(questionInput),
    chart: { ...chart, angles: chart.angles!, houses: chart.houses! } };
}

const onlyVoid = createRulePolicy({ rules: Object.fromEntries(
  CONSIDERATION_RULE_IDS.map((id) => [id, id === "moon-void-of-course"])
) });
const observe = (result = fixture()) => evaluateConsiderations(result, onlyVoid).observations.at(-1)!;

// A hand-written scanner response checks serialization and delegation only.
// Independent angular motion fixtures run the actual scanner in the next file.
function scannerResponse() {
  return {
    at: new Date(noon), isVoid: true,
    current: {
      from: new Date("2000-01-01T06:00:00Z"), to: new Date("2000-01-02T00:00:00Z"),
      sign: "aries", nextSign: "taurus",
      lastAspect: { at: new Date("2000-01-01T06:00:00Z"), body: "Sun", aspect: "sextile", moonLon: 25 }
    },
    next: null
  } as const;
}

afterEach(() => vi.restoreAllMocks());

describe("void consideration wrapper", () => {
  it("delegates on the normalized question instant, explicitly selecting traditional bodies", () => {
    const scan = vi.spyOn(engine, "voidOfCourseAt").mockReturnValue(scannerResponse());
    const natal = vi.spyOn(engine, "natalChart");
    const result = fixture();
    result.chart.bodies = [];
    // It is intentionally not driven by a stale or edited chart instant/clock.
    result.chart.input.utc = new Date("2001-01-01T00:00:00Z");
    const before = structuredClone(result);
    const item = observe(result);
    expect(scan.mock.calls).toEqual([[noon, { bodies: "traditional" }]]);
    expect(natal).not.toHaveBeenCalled();
    expect(result).toEqual(before);
    expect(item).toMatchObject({ rule: "moon-void-of-course", status: "triggered",
      source: { id: "lilly-void-of-course", locator: "Printed p. 112; PDF p. 139" },
      scan: { at: noon.toISOString(), clock: "engine-utc-model", isVoid: true,
        bodies: ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"],
        aspects: ["conjunction", "sextile", "square", "trine", "opposition"],
        sampledFrom: "1999-12-25T12:00:00.000Z", sampledTo: "2000-01-07T12:00:00.000Z",
        current: { startBasis: "last-exact-aspect", lastAspect: { body: "Sun", moonLongitude: 25 } }, next: null }
    });
    expect(item.explanation).toContain("sextile to Sun");
    expect(item.explanation).toContain("sampled");
    expect(item).not.toHaveProperty("verdict");
  });

  it("preserves no-contact and non-void scanner responses without inferring a verdict", () => {
    const response = scannerResponse();
    const scan = vi.spyOn(engine, "voidOfCourseAt").mockReturnValue({ ...response,
      current: { ...response.current, lastAspect: null } });
    expect(observe()).toMatchObject({ status: "triggered", scan: {
      current: { startBasis: "sign-ingress", lastAspect: null } } });
    expect(observe().explanation).toContain("no selected exact contact");
    scan.mockReturnValue({ ...response, isVoid: false, current: null, next: response.current });
    expect(observe()).toMatchObject({ status: "not-triggered", scan: { isVoid: false, current: null,
      next: { sign: "aries", startBasis: "last-exact-aspect" } } });
  });

  it("skips the scanner entirely when disabled, even at an unsupported ephemeris instant", () => {
    const scan = vi.spyOn(engine, "voidOfCourseAt");
    const result = fixture();
    Object.assign(result, { input: normalizeHoraryInput({ ...questionInput, instant: "+030000-01-01T00:00:00Z" }) });
    const policy = createRulePolicy({ rules: Object.fromEntries(CONSIDERATION_RULE_IDS.map((id) => [id, false])) });
    expect(evaluateConsiderations(result, policy).observations.at(-1)).toMatchObject({
      status: "disabled", evidence: []
    });
    expect(scan).not.toHaveBeenCalled();
  });

  it("propagates scan failures instead of reporting them as non-void", () => {
    vi.spyOn(engine, "voidOfCourseAt").mockImplementation(() => { throw new RangeError("outside ephemeris span"); });
    expect(() => observe()).toThrow("outside ephemeris span");
  });

  it("copies scanner Dates to deeply frozen JSON-safe evidence", () => {
    const response = scannerResponse();
    vi.spyOn(engine, "voidOfCourseAt").mockReturnValue(response);
    const item = observe();
    expect(JSON.parse(JSON.stringify(item))).toEqual(item);
    function frozen(value: unknown): void {
      if (!value || typeof value !== "object") return;
      expect(Object.isFrozen(value)).toBe(true);
      for (const child of Object.values(value)) frozen(child);
    }
    frozen(item);
    response.current.from.setUTCFullYear(2002);
    response.current.lastAspect.at.setUTCFullYear(2002);
    expect(item.scan!.current!.from).toBe("2000-01-01T06:00:00.000Z");
    expect(item.scan!.current!.lastAspect!.at).toBe("2000-01-01T06:00:00.000Z");
    expect(item.scan!.method).toBe(MOON_VOID_SCAN_METHOD);
  });
});
