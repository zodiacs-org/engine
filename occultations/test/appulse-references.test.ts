import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { searchAppulses } from "../src/index.js";
import { assertReferenceChecks, type ReferenceCheck } from "./reference-checks.js";

type Request = Parameters<typeof searchAppulses>[0];
interface AppulseReference {
  readonly id: string;
  readonly partition: string;
  readonly kind: string;
  readonly validationUse: string;
  readonly criteriaId: string;
  readonly pair: readonly [Request["first"], Request["second"]];
  readonly window: { readonly from: string; readonly to: string; readonly scale: string };
  readonly published: { readonly utcFromStatedZone: string };
  readonly checks: readonly ReferenceCheck[];
}

// Import only development cases. Held-out event comparisons belong to M12.
const development = JSON.parse(readFileSync(
  new URL("./fixtures/events/development.json", import.meta.url), "utf8"
)) as { readonly partition: string; readonly cases: readonly AppulseReference[] };
const references = development.cases.filter((row) => row.kind === "appulse");

describe("independent NAOJ development appulse coarse occurrence", () => {
  it("requires every frozen development appulse and its original acceptance limit", () => {
    expect(development.partition).toBe("development");
    expect(references.map((row) => row.id)).toEqual(["jupiter-saturn-appulse-2020"]);
    for (const reference of references) {
      expect(reference.partition, reference.id).toBe("development");
      expect(reference.validationUse, reference.id).toBe("coarse-occurrence");
      expect(reference.criteriaId, reference.id).toBe("coarse-planet-hour");
      expect(reference.window.scale, reference.id).toBe("utc");
      expect(reference.checks, reference.id).toEqual([{
        key: "eventTime",
        value: Date.parse(reference.published.utcFromStatedZone) / 1000,
        unit: "nominal-utc-seconds",
        maximumAbsoluteError: 3600
      }]);
    }
  });

  it.each(references)("matches the frozen coarse timing criterion: $id", (reference) => {
    // The source gives an approximate JST hour without specifying the observer
    // center. This gate cannot establish precision geocentric minimum timing.
    const result = searchAppulses({
      first: reference.pair[0],
      second: reference.pair[1],
      maximumSeparationDegrees: 10,
      window: {
        from: reference.window.from + "Z",
        to: reference.window.to + "Z"
      }
    });
    expect(result.status, reference.id).toBe("complete");
    if (result.status !== "complete") throw new Error(`${reference.id}: appulse search refused`);
    expect(result.events, reference.id).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.receipt, reference.id).toBeDefined();
    assertReferenceChecks(reference.checks, { eventTime: Date.parse(event.at) / 1000 });
  });
});
