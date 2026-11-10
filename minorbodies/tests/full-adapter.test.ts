import { beforeAll, describe, expect, it } from "vitest";
import { calc } from "../../src/calc.js";
import { createAspectPolicy, findConfiguredAspects } from "../../src/configured-aspects.js";
import { ASPECT_ROW_CONVENTIONS, createBodyAdapter } from "../src/body-adapter.ts";
import { MINOR_BODY_NAMES } from "../src/catalog.ts";
import type { MinorBody } from "../src/catalog.ts";
import type { MinorBodyEphemeris } from "../src/ephemeris.ts";
import { FULL_RECIPE } from "../src/full-recipe.ts";
import { loadFullBody } from "../src/full.ts";

// Explicit full-data integration suite: missing local sources or coefficients fail.
// Equality to the loaded provider is dispatch evidence, not independent accuracy.
// full-accuracy.test.ts compares the held-out Horizons corpus through ERFA.
const providers = new Map<MinorBody, MinorBodyEphemeris>();
let adapter: Awaited<ReturnType<typeof createBodyAdapter>>;
const DAY_MS = 86_400_000;

// The calendar text labels TT here; Date supplies Gregorian calendar arithmetic only.
function calendarJdTt(label: string): number {
  return 2440587.5 + Date.parse(label) / DAY_MS;
}

const sampleEpochs = [
  FULL_RECIPE.startJdTt,
  FULL_RECIPE.startJdTt + 0.25,
  2451545,
  calendarJdTt("2200-01-01T00:00:00Z"),
  calendarJdTt("2200-07-01T12:00:00Z"),
  FULL_RECIPE.endJdTt - 0.000001
];

beforeAll(async () => {
  // Source verification is deliberately serial, keeping the bulk input reads bounded.
  for (const body of MINOR_BODY_NAMES) providers.set(body, await loadFullBody(body));
  adapter = await createBodyAdapter([...providers.values()]);
}, 300_000);

describe("all required minor bodies through the full-data adapter", () => {
  it.each(MINOR_BODY_NAMES)("dispatches %s to its own loaded dataset across finite TT samples", body => {
    const provider = providers.get(body)!;
    for (const jd of sampleEpochs) {
      const time = { jd, scale: "tt" as const };
      const expected = provider.calculate(body, time);
      const actual = adapter.calcWithMinorBodies({ body, time });
      if (expected.status !== "ok" || actual.status !== "ok" || actual.provider !== "minorbodies") {
        throw new Error(`Expected ${body} dispatch at TT JD ${jd} to succeed.`);
      }
      expect(actual.result).toEqual(expected);
      expect(actual.result.body).toBe(body);
      expect(actual.result.jdTt).toBe(jd);
      expect(actual.receipt.dataset).toEqual(provider.dataset);
      expect(actual.receipt.dataset?.sourceIdentity.body).toBe(body);
      expect(actual.receipt.calculation).toEqual(expected.receipt);
      expect(actual.receipt.time?.jdTt).toBe(jd);
      expect(actual.receipt.request).toEqual({ body, time });
      expect(actual.result.receipt.evaluatedShard).not.toBeNull();
      expect(actual.result.retrograde).toBe(actual.result.longitudeSpeedDegPerDay < 0);
      for (const value of [actual.result.longitudeDeg, actual.result.latitudeDeg, actual.result.distanceAu,
        actual.result.longitudeSpeedDegPerDay, actual.result.latitudeSpeedDegPerDay,
        actual.result.distanceSpeedAuPerDay]) expect(Number.isFinite(value)).toBe(true);
    }
  });

  it.each(MINOR_BODY_NAMES)("preserves the half-open installed coverage for %s", body => {
    for (const jd of [FULL_RECIPE.startJdTt - 0.000001, FULL_RECIPE.endJdTt]) {
      const time = { jd, scale: "tt" as const };
      const expected = providers.get(body)!.calculate(body, time);
      const actual = adapter.calcWithMinorBodies({ body, time });
      expect(expected).toMatchObject({ status: "refused", reason: "outside-coverage" });
      expect(actual).toMatchObject({ status: "refused", provider: "minorbodies",
        reason: "outside-coverage", refusal: expected });
      expect(actual.receipt.dataset).toEqual(providers.get(body)!.dataset);
      expect(actual.receipt.calculation).toEqual(expected.receipt);
      expect(actual.receipt.time?.jdTt).toBe(jd);
    }
  });

  it("retains the engine's narrower coverage when the minor-body datasets admit 2200", () => {
    const time = { jd: calendarJdTt("2200-07-01T12:00:00Z"), scale: "tt" as const };
    const expected = calc({ body: "Mars", time });
    if (expected.status !== "refused") throw new Error("Expected the engine's reference-span refusal.");
    expect(adapter.calcWithMinorBodies({ body: "Mars", time })).toMatchObject({
      status: "refused", provider: "engine", reason: expected.reason, refusal: expected
    });
    for (const body of MINOR_BODY_NAMES) {
      expect(adapter.calcWithMinorBodies({ body, time })).toMatchObject({ status: "ok", provider: "minorbodies" });
    }
    expect(adapter.aspectRows([...MINOR_BODY_NAMES, "Mars"], time))
      .toMatchObject({ status: "refused", body: "Mars", reason: expected.reason, rows: [] });
  });
});

describe("configured aspects from full-data minor bodies and engine Mars", () => {
  it("matches direct provider rows, common TT clocks, and engine aspect analysis", () => {
    const bodies = [...MINOR_BODY_NAMES, "Mars" as const];
    const time = { jd: 2451600.25, scale: "tt" as const };
    const actual = adapter.aspectRows(bodies, time);
    if (actual.status !== "ok") throw new Error("Expected full-data mixed aspect rows.");
    const expectedRows = MINOR_BODY_NAMES.map(body => {
      const position = providers.get(body)!.calculate(body, time);
      if (position.status !== "ok") throw new Error(`Expected a loaded ${body} position.`);
      return { body: body as string, lon: position.longitudeDeg, speed: position.longitudeSpeedDegPerDay };
    });
    const mars = calc({ body: "Mars", time });
    if (mars.status !== "ok" || !mars.speeds) throw new Error("Expected an engine Mars position with speed.");
    expectedRows.push({ body: "Mars", lon: mars.lon, speed: mars.speeds.lon });
    expect(actual.rows).toEqual(expectedRows);
    expect(actual.receipt.bodies).toEqual(bodies);
    expect(actual.receipt.time?.jdTt).toBe(time.jd);
    expect(mars.receipt.instants[0]!.jdTt).toBe(time.jd);
    expect(actual.receipt.conventions).toEqual(ASPECT_ROW_CONVENTIONS);
    expect(actual.receipt.calculations).toEqual(bodies.map(body => adapter.calcWithMinorBodies({ body, time }).receipt));

    // A deliberately wide configured orb exercises every pair, without relying on
    // an incidental near-aspect at this finite integration epoch.
    const policy = createAspectPolicy({ bodies, aspects: [{ type: "conjunction", orb: 180 }] });
    const aspects = findConfiguredAspects(actual.rows, policy);
    expect(aspects).toEqual(findConfiguredAspects(expectedRows, policy));
    expect(aspects.aspects).toHaveLength(bodies.length * (bodies.length - 1) / 2);
    for (const body of MINOR_BODY_NAMES) {
      expect(aspects.aspects.some(item => (item.a === body && item.b === "Mars") ||
        (item.a === "Mars" && item.b === body))).toBe(true);
    }
  });
});
