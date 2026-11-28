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
  readonly criteriaId: string;
  readonly sourceId: string;
  readonly locator: string;
  readonly pair: readonly ["Moon", Request["target"]];
  readonly observer: Request["observer"];
  readonly window: { readonly from: string; readonly to: string; readonly scale: string };
  readonly checks: readonly ReferenceCheck[];
}

// The held-out partition remains unopened until M12. These source values and
// their acceptance limits were frozen before the contact solver was built.
const development = JSON.parse(readFileSync(
  new URL("./fixtures/events/development.json", import.meta.url), "utf8"
)) as { readonly partition: string; readonly cases: readonly ContactReference[] };
const references = development.cases.filter((row) =>
  row.kind === "stellar-contacts" || row.kind === "planetary-contacts");

const contactKindByPrefix = {
  disappearance: "disappearance",
  reappearance: "reappearance",
  disappearanceStart: "partial-disappearance-start",
  disappearanceEnd: "full-disappearance",
  reappearanceStart: "full-reappearance-start",
  reappearanceEnd: "partial-reappearance-end"
} as const satisfies Readonly<Record<string, Contact["kind"]>>;

const starPrefixes = ["disappearance", "reappearance"] as const;
const planetPrefixes = [
  "disappearanceStart", "disappearanceEnd", "reappearanceStart", "reappearanceEnd"
] as const;
const starSkyKeys = ["disappearancePositionAngle", "reappearancePositionAngle"] as const;
const planetSkyKeys = [
  "disappearanceStartPositionAngle", "disappearanceStartMoonAltitude",
  "disappearanceEndPositionAngle", "disappearanceEndMoonAltitude",
  "reappearanceStartPositionAngle", "reappearanceStartMoonAltitude",
  "reappearanceEndPositionAngle", "reappearanceEndMoonAltitude"
] as const;

function skyKeys(reference: ContactReference): readonly string[] {
  return reference.kind === "stellar-contacts" ? starSkyKeys : planetSkyKeys;
}

function skyChecks(reference: ContactReference): readonly ReferenceCheck[] {
  const keys = skyKeys(reference);
  return reference.checks.filter((check) => keys.includes(check.key));
}

// Source UT and historical Greenwich mean time are nominal UT1 here. The Z
// suffix only makes a calendar label parseable; it does not call the source UTC.
const ut1LabelToInput = (label: string): string =>
  new Date(timeBasis(Date.parse(label + "Z"), "ut1").utcMs).toISOString();

describe("independent development lunar contact position angles and Moon altitudes", () => {
  it("covers every frozen angle and altitude check with the original limits", () => {
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
      expect(skyChecks(reference).map((check) => check.key), reference.id)
        .toEqual(skyKeys(reference));
      for (const check of skyChecks(reference)) {
        const positionAngle = check.key.endsWith("PositionAngle");
        expect(check.unit, `${reference.id}:${check.key}`).toBe("degrees");
        expect(check.maximumAbsoluteError, `${reference.id}:${check.key}`)
          .toBe(positionAngle ? 2 : 0.5);
        expect(check.difference, `${reference.id}:${check.key}`)
          .toBe(positionAngle ? "circular-degrees" : undefined);
      }

      // The separate M8 timing tests own these exact time/duration checks.
      // Together, both suites leave only the independently solved local minimum.
      const prefixes = reference.kind === "stellar-contacts" ? starPrefixes : planetPrefixes;
      const timingKeys: readonly string[] = [
        ...prefixes.map((prefix) => `${prefix}Time`),
        ...(reference.kind === "planetary-contacts"
          ? ["disappearanceDiskCrossingDuration", "reappearanceDiskCrossingDuration"] : [])
      ];
      const deferred = reference.checks.filter((check) =>
        !skyKeys(reference).includes(check.key) && !timingKeys.includes(check.key));
      expect(deferred.map((check) => check.key), reference.id)
        .toEqual(reference.kind === "stellar-contacts" ? [] : ["closestApproachTime"]);
    }
  });

  it.each(references)("meets all frozen angle and altitude limits at solved contacts: $id", (reference) => {
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
    const prefixes = reference.kind === "stellar-contacts" ? starPrefixes : planetPrefixes;
    expect(result.contacts.map((contact) => contact.kind), reference.id)
      .toEqual(prefixes.map((prefix) => contactKindByPrefix[prefix]));
    expect(result.receipt, reference.id).toBeDefined();

    const actual: Record<string, number> = {};
    for (const prefix of prefixes) {
      const contacts = result.contacts.filter((contact) => contact.kind === contactKindByPrefix[prefix]);
      expect(contacts, `${reference.id}:${prefix}`).toHaveLength(1);
      const contact = contacts[0]!;
      expect(contact.receipt, `${reference.id}:${prefix}`).toBeDefined();
      const positionAngle = contact.sky.positionAngleDegrees;
      if (positionAngle === null) throw new Error(`${reference.id}:${prefix}: undefined position angle`);
      actual[`${prefix}PositionAngle`] = positionAngle;
      if (reference.kind === "planetary-contacts") {
        // EVENTS.md preregistered refracted altitude. Use that field at the
        // computed contact, not an altitude evaluated at the published instant.
        const altitude = contact.sky.moon.refractedAltitudeDegrees;
        if (altitude === null) throw new Error(`${reference.id}:${prefix}: unavailable refracted altitude`);
        actual[`${prefix}MoonAltitude`] = altitude;
      }
    }
    // No source radius, delta-T, coordinate offset or angle is fitted.
    assertReferenceChecks(skyChecks(reference), actual);
  });
});
