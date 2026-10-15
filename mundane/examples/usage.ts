import {
  analyzeFactors, searchIngresses, searchLunations, searchMundaneReport
} from "../src/index.js";
import type { MundaneEvent, MundaneRequest } from "../src/index.js";

// Invented coordinates and labels; these are astronomical event charts,
// without birth data. No expected astronomical instant is stored here.
const place = { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 };

function eventLabel(event: MundaneEvent): string {
  switch (event.kind) {
    case "solar-ingress": return event.sign;
    case "lunation": return event.phase;
    case "eclipse": return event.contactKind;
  }
}

/** Runnable library usage, bundled locally by scripts/check-examples.mjs. */
export function runUsageExamples() {
  const annual: MundaneRequest = { place, year: 2024, houseSystem: "regiomontanus" };
  const ingresses = searchIngresses(annual);
  if (ingresses.status === "refused") throw new Error(ingresses.reason);

  const range: MundaneRequest = { place, from: "2024-03-01", to: "2024-04-01" };
  const lunations = searchLunations(range);
  if (lunations.status === "refused") throw new Error(lunations.reason);

  const report = searchMundaneReport(range);
  if (report.status === "refused") throw new Error(report.reason);
  const first = report.events[0];
  if (!first) throw new Error("This example needs a nonempty event range.");

  // Keep structured chart and factor metadata alongside any displayed text.
  const { chart, angularity, angleRulers, factors } = first;
  // A different angle orb requires a separate analysis of the same chart.
  // Search results keep their default analyses; they are frozen snapshots.
  const custom = analyzeFactors(chart, { angleOrbDegrees: 3 });

  // Refusal is separate from a completed range without events. An explicitly
  // small budget demonstrates the refusal branch, without partial output.
  const limited = searchMundaneReport(range, { lunationMaxSamples: 1 });
  if (limited.status !== "refused") throw new Error("Expected a budget refusal.");

  return {
    annualIngresses: ingresses.ingresses.length,
    rangedLunations: lunations.lunations.length,
    eventLabels: report.events.map(eventLabel),
    firstEvent: {
      kind: first.kind, at: first.at,
      angles: chart.angles, houses: chart.houses, bodies: chart.bodies,
      angularity, angleRulers,
      factorList: factors,
      flags: chart.flags, timeScale: chart.timeScale, provenance: chart.provenance
    },
    customFactors: custom,
    refusal: { status: limited.status, reason: limited.reason, events: limited.events }
  };
}
