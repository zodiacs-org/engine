import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { timeBasis } from "../../src/time-scale.js";
import { searchConjunctions } from "../src/index.js";
import { assertReferenceChecks, type ReferenceCheck } from "./reference-checks.js";

type Request = Parameters<typeof searchConjunctions>[0];
interface CoordinateReference {
  readonly id: string;
  readonly partition: string;
  readonly kind: string;
  readonly validationUse: string;
  readonly pair: readonly [Request["first"], Request["second"]];
  readonly window: { readonly from: string; readonly to: string; readonly scale: string };
  readonly checks: readonly ReferenceCheck[];
}

// Import only development cases. Held-out event comparisons belong to M12.
const development = JSON.parse(readFileSync(
  new URL("./fixtures/events/development.json", import.meta.url), "utf8"
)) as { readonly partition: string; readonly cases: readonly CoordinateReference[] };
const references = development.cases.filter((row) => row.validationUse === "coordinate-event");
const coordinates: Readonly<Record<string, Request["coordinate"]>> = {
  "right-ascension-conjunction": "right-ascension",
  "ecliptic-longitude-conjunction": "ecliptic-longitude"
};

// Z is a parser encoding of the reference's TT label, not a claim it is UTC.
const ttLabelToUtc = (label: string): string =>
  new Date(timeBasis(Date.parse(label + "Z"), "tt").utcMs).toISOString();
const utcToNominalTtSeconds = (at: string): number =>
  Date.UTC(2000, 0, 1, 12) / 1000 + timeBasis(Date.parse(at), "utc").ttDays * 86_400;

describe("independent NAOJ development conjunction predictions", () => {
  it("requires every registered development coordinate event", () => {
    expect(development.partition).toBe("development");
    expect(references.map((row) => row.id)).toEqual([
      "jupiter-saturn-ra-2020",
      "jupiter-saturn-ecliptic-2020",
      "moon-mars-ra-2024-jan",
      "moon-mars-ecliptic-2024-jan"
    ]);
    for (const reference of references) {
      expect(reference.partition, reference.id).toBe("development");
      expect(reference.window.scale, reference.id).toBe("tt");
      expect(coordinates[reference.kind], reference.id).toBeDefined();
      expect(reference.checks.map((check) => [check.key, check.unit]), reference.id)
        .toEqual([["eventTime", "nominal-tt-seconds"]]);
    }
  });

  it.each(references)("matches the frozen timing criterion: $id", (reference) => {
    const result = searchConjunctions({
      first: reference.pair[0],
      second: reference.pair[1],
      coordinate: coordinates[reference.kind]!,
      window: {
        from: ttLabelToUtc(reference.window.from),
        to: ttLabelToUtc(reference.window.to)
      }
    });
    expect(result.status, reference.id).toBe("complete");
    if (result.status !== "complete") throw new Error(`${reference.id}: conjunction search refused`);
    expect(result.events, reference.id).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.receipt, reference.id).toBeDefined();
    assertReferenceChecks(reference.checks, { eventTime: utcToNominalTtSeconds(event.at) });
  });
});
