import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { timeBasis } from "../../src/time-scale.js";
import { searchLunarContacts } from "../src/index.js";
import { assertReferenceChecks, type ReferenceCheck } from "./reference-checks.js";

type Request = Parameters<typeof searchLunarContacts>[0];
type Completed = Extract<ReturnType<typeof searchLunarContacts>, { readonly status: "complete" }>;
type Contact = Completed["contacts"][number];
interface ContactReference {
  readonly id: string;
  readonly partition: string;
  readonly kind: string;
  readonly validationUse: string;
  readonly criteriaId: string;
  readonly sourceId: string;
  readonly locator: string;
  readonly pair: readonly ["Moon", Request["target"]];
  readonly observer: Request["observer"];
  readonly window: { readonly from: string; readonly to: string; readonly scale: string };
  readonly checks: readonly ReferenceCheck[];
}

// Only development cases are evaluated. Held-out comparisons remain for M12.
const development = JSON.parse(readFileSync(
  new URL("./fixtures/events/development.json", import.meta.url), "utf8"
)) as { readonly partition: string; readonly cases: readonly ContactReference[] };
const references = development.cases.filter((row) =>
  row.kind === "stellar-contacts" || row.kind === "planetary-contacts");

const contactKindByTimeKey = {
  disappearanceTime: "disappearance",
  reappearanceTime: "reappearance",
  disappearanceStartTime: "partial-disappearance-start",
  disappearanceEndTime: "full-disappearance",
  reappearanceStartTime: "full-reappearance-start",
  reappearanceEndTime: "partial-reappearance-end"
} as const satisfies Readonly<Record<string, Contact["kind"]>>;

const starTimeKeys = ["disappearanceTime", "reappearanceTime"] as const;
const planetTimeKeys = [
  "disappearanceStartTime", "disappearanceEndTime", "reappearanceStartTime", "reappearanceEndTime"
] as const;
const diskDurationKeys = ["disappearanceDiskCrossingDuration", "reappearanceDiskCrossingDuration"] as const;

function coveredKeys(reference: ContactReference): readonly string[] {
  return reference.kind === "stellar-contacts" ? starTimeKeys : [...planetTimeKeys, ...diskDurationKeys];
}

function coveredChecks(reference: ContactReference): readonly ReferenceCheck[] {
  const keys = coveredKeys(reference);
  return reference.checks.filter((check) => keys.includes(check.key));
}

// Source UT and historical Greenwich mean time are compared as nominal UT1.
// Z encodes a calendar label for parsing; it does not relabel that source UTC.
const ut1LabelToInput = (label: string): string =>
  new Date(timeBasis(Date.parse(label + "Z"), "ut1").utcMs).toISOString();
const inputToNominalUt1Seconds = (at: string): number =>
  Date.UTC(2000, 0, 1, 12) / 1000 + timeBasis(Date.parse(at), "utc").ut1Days * 86_400;

describe("independent development spherical lunar contact timing", () => {
  it("locks the timing subset and explicitly retains the deferred checks", () => {
    expect(development.partition).toBe("development");
    expect(references.map((row) => row.id)).toEqual([
      "usno-ae1923-aldebaran-jan27-boston", "naoj-contacts-202408"
    ]);
    for (const reference of references) {
      expect(reference.partition, reference.id).toBe("development");
      expect(reference.window.scale, reference.id).toBe("ut1");
      expect(reference.criteriaId, reference.id).toBe("lunar-contact");
      expect(reference.pair[0], reference.id).toBe("Moon");
      expect(reference.sourceId.length, reference.id).toBeGreaterThan(0);
      expect(reference.locator.length, reference.id).toBeGreaterThan(0);
      expect(reference.validationUse, reference.id).toBe(reference.kind === "stellar-contacts"
        ? "historical-sphere-model-comparison" : "qualified-disk-model-comparison");
      expect(coveredChecks(reference).map((check) => check.key), reference.id)
        .toEqual(coveredKeys(reference));
      for (const check of coveredChecks(reference)) {
        const duration = check.key.endsWith("DiskCrossingDuration");
        expect(check.unit, `${reference.id}:${check.key}`)
          .toBe(duration ? "seconds" : "nominal-ut1-seconds");
        expect(check.maximumAbsoluteError, `${reference.id}:${check.key}`).toBe(duration ? 10 : 120);
      }
      // M9 owns angle/altitude comparisons. The local minimum row remains a
      // separate M12 requirement, never a contact or an average of contact times.
      const deferred = reference.checks.filter((check) => !coveredKeys(reference).includes(check.key));
      expect(deferred.map((check) => check.key), reference.id).toEqual(reference.kind === "stellar-contacts"
        ? ["disappearancePositionAngle", "reappearancePositionAngle"]
        : [
          "disappearanceStartPositionAngle", "disappearanceStartMoonAltitude",
          "disappearanceEndPositionAngle", "disappearanceEndMoonAltitude", "closestApproachTime",
          "reappearanceStartPositionAngle", "reappearanceStartMoonAltitude",
          "reappearanceEndPositionAngle", "reappearanceEndMoonAltitude"
        ]);
    }
  });

  it.each(references)("meets every frozen contact-time and disk-duration limit: $id", (reference) => {
    const result = searchLunarContacts({
      target: reference.pair[1],
      observer: reference.observer,
      window: {
        from: ut1LabelToInput(reference.window.from),
        to: ut1LabelToInput(reference.window.to)
      }
    });
    expect(result.status, reference.id).toBe("complete");
    if (result.status !== "complete") throw new Error(`${reference.id}: local contact search refused`);
    const keys = reference.kind === "stellar-contacts" ? starTimeKeys : planetTimeKeys;
    expect(result.contacts.map((contact) => contact.kind), reference.id)
      .toEqual(keys.map((key) => contactKindByTimeKey[key]));
    expect(result.receipt, reference.id).toBeDefined();

    const actual: Record<string, number> = {};
    for (const key of keys) {
      const contacts = result.contacts.filter((contact) => contact.kind === contactKindByTimeKey[key]);
      expect(contacts, `${reference.id}:${key}`).toHaveLength(1);
      const contact = contacts[0]!;
      expect(contact.receipt, `${reference.id}:${key}`).toBeDefined();
      actual[key] = inputToNominalUt1Seconds(contact.at);
    }
    const contactTimes = keys.map((key) => actual[key]!);
    for (let index = 1; index < contactTimes.length; index += 1) {
      expect(contactTimes[index], reference.id).toBeGreaterThan(contactTimes[index - 1]!);
    }
    if (reference.kind === "planetary-contacts") {
      actual.disappearanceDiskCrossingDuration = actual.disappearanceEndTime! - actual.disappearanceStartTime!;
      actual.reappearanceDiskCrossingDuration = actual.reappearanceEndTime! - actual.reappearanceStartTime!;
    }
    // No source radius, delta-T, station adjustment or timing offset is fitted.
    assertReferenceChecks(coveredChecks(reference), actual);
  });
});
