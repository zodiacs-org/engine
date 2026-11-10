import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { timeBasis } from "../../src/time-scale.js";
import { searchLunarOccultations } from "../src/index.js";
import type { ReferenceCheck } from "./reference-checks.js";

type Request = Parameters<typeof searchLunarOccultations>[0];
interface OccultationReference {
  readonly id: string;
  readonly partition: string;
  readonly kind: string;
  readonly eventGroup: string;
  readonly pair: readonly ["Moon", Request["target"]];
  readonly sourceId: string;
  readonly locator: string;
  readonly window: { readonly from: string; readonly to: string; readonly scale: string };
  readonly checks: readonly ReferenceCheck[];
}

// Import only development values. Held-out event comparisons belong to M12.
const development = JSON.parse(readFileSync(
  new URL("./fixtures/events/development.json", import.meta.url), "utf8"
)) as { readonly partition: string; readonly cases: readonly OccultationReference[] };
const references = development.cases.filter((row) => [
  "stellar-contacts", "planetary-contacts", "visibility-outline"
].includes(row.kind));
const contactReferences = references.filter((row) => row.kind !== "visibility-outline");

// The input number encodes nominal UT1 using the Unix calendar origin. It
// does not assert that a source time marked UT or historical mean time is UTC.
const nominalUt1ToInputMs = (ms: number): number => timeBasis(ms, "ut1").utcMs;
const ut1LabelToInput = (label: string): string =>
  new Date(nominalUt1ToInputMs(Date.parse(label + "Z"))).toISOString();

describe("independent development occultation candidate retention", () => {
  it("covers every frozen development contact and outline group", () => {
    expect(development.partition).toBe("development");
    expect(references.map((row) => row.id)).toEqual([
      "usno-ae1923-aldebaran-jan27-boston",
      "naoj-contacts-202408",
      "naoj-map-202408"
    ]);
    expect(contactReferences.map((row) => row.eventGroup)).toEqual([
      "moon-aldebaran-1923-01-27", "moon-saturn-2024-05-31"
    ]);
    for (const reference of references) {
      expect(reference.partition, reference.id).toBe("development");
      expect(reference.window.scale, reference.id).toBe("ut1");
      expect(reference.pair[0], reference.id).toBe("Moon");
      expect(reference.sourceId.length, reference.id).toBeGreaterThan(0);
      expect(reference.locator.length, reference.id).toBeGreaterThan(0);
      // Every source group is exercised by a contact event below. The map
      // is the same event, not an additional independent occultation.
      const localReference = contactReferences.find((row) => row.eventGroup === reference.eventGroup);
      expect(localReference, reference.id).toBeDefined();
      expect(localReference!.pair, reference.id).toEqual(reference.pair);
      expect(localReference!.window, reference.id).toEqual(reference.window);
    }
    // Lock the full instant lists used in this screen without changing any
    // of the original contact, angle, altitude or outline acceptance gates.
    expect(contactReferences.map((reference) => reference.checks
      .filter((check) => check.unit === "nominal-ut1-seconds").map((check) => check.key)))
      .toEqual([
        ["disappearanceTime", "reappearanceTime"],
        ["disappearanceStartTime", "disappearanceEndTime", "closestApproachTime",
          "reappearanceStartTime", "reappearanceEndTime"]
      ]);
  });

  it.each(contactReferences)("retains all published local instants in one candidate: $id", (reference) => {
    // This checks the preregistered broad-envelope containment rule in
    // fixtures/events/CANDIDATES.md, not a geocentric/local timing equality.
    const result = searchLunarOccultations({
      target: reference.pair[1],
      window: {
        from: ut1LabelToInput(reference.window.from),
        to: ut1LabelToInput(reference.window.to)
      }
    });
    expect(result.status, reference.id).toBe("complete");
    if (result.status !== "complete") throw new Error(`${reference.id}: candidate search refused`);
    const localInstants = reference.checks
      .filter((check) => check.unit === "nominal-ut1-seconds")
      .map((check) => nominalUt1ToInputMs(check.value * 1000));
    expect(localInstants.length, reference.id).toBeGreaterThan(0);
    const candidates = result.candidates.filter((candidate) => candidate.target === reference.pair[1]);
    expect(candidates.length, reference.id).toBeGreaterThan(0);
    const containingCandidate = candidates.find((candidate) => localInstants.every((at) =>
      at >= Date.parse(candidate.interval.from) && at <= Date.parse(candidate.interval.to)));
    expect(containingCandidate, `${reference.id}: full local event must survive candidate screening`)
      .toBeDefined();
    expect(containingCandidate!.receipt, reference.id).toBeDefined();
  });
});
