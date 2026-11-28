import { beforeAll, describe, expect, it } from "vitest";
import { MINOR_BODY_NAMES } from "../src/catalog.ts";
import { ACCEPTANCE_POLICY } from "../src/acceptance.ts";
import { FINAL_EVENT_RECIPE, finalEventWindows } from "../src/final-event-reference.ts";
import { validateFinalEvents } from "../src/final-event-validation.ts";

// Explicit full-data gate. Missing sources, reference dependencies or coefficients fail.
for (const body of MINOR_BODY_NAMES) describe(`${body} M11 independent event windows`, () => {
  let report: Awaited<ReturnType<typeof validateFinalEvents>>;
  beforeAll(async () => { report = await validateFinalEvents(body); }, 300_000);

  it("checks all registered windows with original source identities and no skipped comparisons", () => {
    expect(report.body).toBe(body);
    expect(report.recipe).toEqual(FINAL_EVENT_RECIPE);
    expect(report.scope).toBe(FINAL_EVENT_RECIPE.scope);
    expect(report.windows.map(window => [window.year, window.fromJdTt, window.toJdTt])).toEqual(
      finalEventWindows().map(window => [window.year, window.fromJdTt, window.toJdTt]));
    expect(report.counts.positions).toBeGreaterThanOrEqual(1460);
    expect(report.counts.speeds).toBeGreaterThanOrEqual(1460);
    expect(report.sourceManifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.baseSourceManifestSha256).toBe(report.dataset.sourceManifestSha256);
    expect(report.sourceIdentity).toEqual(report.dataset.sourceIdentity);
    expect(report.reference.frame).toBe("ecliptic-true-of-date;IAU2006/2000A");
    expect(report.validationImplementation.nodeVersion).toBe(process.version);
    for (const identity of Object.values(report.searchImplementations)) expect(identity.sha256).toMatch(/^[a-f0-9]{64}$/);
    for (const window of report.windows) {
      expect(window.scanEpochs).toBe(365);
      expect(window.stations.status).toBe("complete");
      expect(window.ingresses.status).toBe("complete");
      expect(window.retrogrades.status).toBe("complete");
      expect(window.stations.events).toBe(window.stationBrackets);
      expect(window.ingresses.events).toBe(window.ingressBrackets);
      expect(window.retrogrades.windows).toBe(window.referenceRetrogradeWindows);
    }
  });

  for (const metric of ["longitudeArcsec", "latitudeArcsec", "distanceAu", "longitudeSpeedArcsecPerDay"] as const) {
    it(`enforces unchanged independent ${metric} agreement near events and through daily scans`, () => {
      expect(report.maxima[metric]).toBeGreaterThanOrEqual(0);
      expect(report.maxima[metric]).toBeLessThanOrEqual(ACCEPTANCE_POLICY.limits[metric]);
    });
  }

  it("requires converged reference derivatives, narrow independent brackets and unchanged event margins", () => {
    expect(report.maxima.referenceSpeedConvergenceArcsecPerDay).toBeLessThanOrEqual(0.01);
    expect(report.maxima.referenceBracketSeconds).toBeLessThanOrEqual(85);
    for (const metric of ["stationOutsideBracketSeconds", "ingressOutsideBracketSeconds", "retrogradeOutsideBracketSeconds"] as const) {
      expect(report.maxima[metric]).toBeGreaterThanOrEqual(0);
      expect(report.maxima[metric]).toBeLessThanOrEqual(300);
    }
  });

  it("requires actual stations, ingresses and both motion states for every required body", () => {
    expect(report.counts.referenceStations).toBeGreaterThan(0);
    expect(report.counts.referenceIngresses).toBeGreaterThan(0);
    expect(report.counts.stationEvents).toBe(report.counts.referenceStations);
    expect(report.counts.ingressEvents).toBe(report.counts.referenceIngresses);
    expect(report.counts.retrogradeWindows).toBeGreaterThan(0);
    expect(report.counts.directSamples).toBeGreaterThan(0);
    expect(report.counts.retrogradeSamples).toBeGreaterThan(0);
    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
  });
});
