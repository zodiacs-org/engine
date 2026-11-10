import { expect } from "vitest";
import type { BodyAdapter } from "../src/body-adapter.ts";
import { ACCEPTANCE_POLICY } from "../src/acceptance.ts";
import { readIngressReference, INGRESS_REFERENCE_RECIPE } from "../src/ingress-reference.ts";
import type { IngressSearcher } from "../src/ingresses.ts";
import type { MinorBody } from "../src/catalog.ts";

const signNames = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const angularError = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180) * 3600;

/** Expected dates, sign directions and comparison positions are held-out JPL/ERFA only. */
export async function checkIngressAccuracy(body: MinorBody, adapter: BodyAdapter, searcher: IngressSearcher) {
  const reference = await readIngressReference(body);
  const result = searcher.searchIngresses({ body,
    from: { jd: reference.recipe.startJdTt, scale: "tt" },
    to: { jd: reference.recipe.endJdTt, scale: "tt" },
    stepDays: 1, maxSamples: 20_000 });
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`Ingress search refused: ${result.reason}`);
  expect(result.ingresses).toHaveLength(reference.events.length);
  const allowance = INGRESS_REFERENCE_RECIPE.ingressAgreementMarginSeconds / 86400;
  let maximumLongitudeErrorArcsec = 0;
  let maximumSpeedErrorArcsecPerDay = 0;
  for (const heldOut of reference.scan) {
    const sampled = adapter.calcWithMinorBodies({ body, time: { jd: heldOut.jdTt, scale: "tt" } });
    if (sampled.status !== "ok" || sampled.provider !== "minorbodies") throw new Error("Missing held-out ingress scan position.");
    const error = angularError(sampled.result.longitudeDeg, heldOut.longitudeDeg);
    maximumLongitudeErrorArcsec = Math.max(maximumLongitudeErrorArcsec, error);
    expect(error).toBeLessThanOrEqual(ACCEPTANCE_POLICY.limits.longitudeArcsec);
    expect(sampled.result.receipt.dataset.sourceIdentity).toEqual(reference.sourceIdentity);
  }
  for (const [index, expected] of reference.events.entries()) {
    const actual = result.ingresses[index]!;
    const signIndex = expected.longitudeDeg / 30;
    const lower = signNames[(signIndex + 11) % 12];
    const upper = signNames[signIndex];
    expect(actual.direction).toBe(expected.direction);
    expect(actual.longitudeDeg).toBe(expected.longitudeDeg);
    expect(actual.fromSign).toBe(expected.direction === "direct" ? lower : upper);
    expect(actual.toSign).toBe(expected.direction === "direct" ? upper : lower);
    expect(actual.jdTt).toBeGreaterThanOrEqual(expected.bracketStartJdTt - allowance);
    expect(actual.jdTt).toBeLessThanOrEqual(expected.bracketEndJdTt + allowance);
    expect(actual.position.jdTt).toBe(actual.jdTt);
    expect(actual.receipt.search).toBe(result.receipt);
    expect(actual.receipt.before.jdTt).toBeLessThan(actual.jdTt);
    expect(actual.receipt.after.jdTt).toBeGreaterThan(actual.jdTt);
    expect(angularError(actual.position.longitudeDeg, actual.longitudeDeg)).toBeLessThanOrEqual(ACCEPTANCE_POLICY.limits.longitudeArcsec);
    for (const heldOut of [expected.beforeRate, expected.afterRate]) {
      expect(Math.sign(heldOut.fineLongitudeSpeedDegPerDay)).toBe(Math.sign(heldOut.coarseLongitudeSpeedDegPerDay));
      expect(Math.abs(heldOut.fineLongitudeSpeedDegPerDay) * 3600).toBeGreaterThan(ACCEPTANCE_POLICY.limits.longitudeSpeedArcsecPerDay);
      expect(Math.abs(heldOut.coarseLongitudeSpeedDegPerDay) * 3600).toBeGreaterThan(ACCEPTANCE_POLICY.limits.longitudeSpeedArcsecPerDay);
      const sampled = adapter.calcWithMinorBodies({ body, time: { jd: heldOut.jdTt, scale: "tt" } });
      if (sampled.status !== "ok" || sampled.provider !== "minorbodies") throw new Error("Missing ingress-neighborhood position.");
      const longitudeError = angularError(sampled.result.longitudeDeg, heldOut.longitudeDeg);
      const speedError = Math.abs(sampled.result.longitudeSpeedDegPerDay - heldOut.fineLongitudeSpeedDegPerDay) * 3600;
      maximumLongitudeErrorArcsec = Math.max(maximumLongitudeErrorArcsec, longitudeError);
      maximumSpeedErrorArcsecPerDay = Math.max(maximumSpeedErrorArcsecPerDay, speedError);
      expect(longitudeError).toBeLessThanOrEqual(ACCEPTANCE_POLICY.limits.longitudeArcsec);
      expect(speedError).toBeLessThanOrEqual(ACCEPTANCE_POLICY.limits.longitudeSpeedArcsecPerDay);
      expect(sampled.result.retrograde).toBe(expected.direction === "retrograde");
      expect(sampled.result.receipt.dataset.sourceIdentity).toEqual(reference.sourceIdentity);
    }
  }
  // Query pieces are selected from independent scan epochs, with no fitted event seeding.
  const split = reference.scan[Math.floor(reference.scan.length / 2)]!.jdTt;
  for (const [from, to] of [[reference.recipe.startJdTt, split], [split, reference.recipe.endJdTt]]) {
    const subset = searcher.searchIngresses({ body, from: { jd: from!, scale: "tt" }, to: { jd: to!, scale: "tt" }, maxSamples: 20_000 });
    expect(subset.status).toBe("complete");
    if (subset.status !== "complete") throw new Error("Independent split ingress query refused.");
    const expectedEvents = reference.events.filter(event => event.bracketStartJdTt > from! && event.bracketEndJdTt <= to!);
    expect(subset.ingresses.map(event => [event.longitudeDeg, event.direction])).toEqual(expectedEvents.map(event => [event.longitudeDeg, event.direction]));
    for (const [index, expected] of expectedEvents.entries()) {
      expect(subset.ingresses[index]!.jdTt).toBeGreaterThanOrEqual(expected.bracketStartJdTt - allowance);
      expect(subset.ingresses[index]!.jdTt).toBeLessThanOrEqual(expected.bracketEndJdTt + allowance);
    }
  }
  return { reference, result, maximumLongitudeErrorArcsec, maximumSpeedErrorArcsecPerDay };
}
