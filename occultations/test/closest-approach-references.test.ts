import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { timeBasis } from "../../src/time-scale.js";
import { searchLocalClosestApproaches } from "../src/index.js";
import type { LocalClosestApproachRequest } from "../src/index.js";
import { assertReferenceChecks } from "./reference-checks.js";
import type { ReferenceCheck } from "./reference-checks.js";

interface Reference {
  readonly id: string;
  readonly partition: string;
  readonly kind: string;
  readonly sourceId: string;
  readonly locator: string;
  readonly pair: readonly ["Moon", LocalClosestApproachRequest["target"]];
  readonly observer: LocalClosestApproachRequest["observer"];
  readonly window: { readonly from: string; readonly to: string; readonly scale: string };
  readonly checks: readonly ReferenceCheck[];
}
const development = JSON.parse(readFileSync(new URL("./fixtures/events/development.json", import.meta.url), "utf8")) as
  { readonly partition: string; readonly cases: readonly Reference[] };
const references = development.cases.filter((row) => row.kind === "planetary-contacts");
const nominalUt1ToInput = (label: string) => new Date(timeBasis(Date.parse(label + "Z"), "ut1").utcMs).toISOString();

describe("independent development local closest approach", () => {
  it("retains the frozen Saturn source and original nominal UT1 timing limit", () => {
    expect(development.partition).toBe("development");
    expect(references.map((row) => row.id)).toEqual(["naoj-contacts-202408"]);
    for (const reference of references) {
      expect(reference.partition).toBe("development");
      expect(reference.sourceId.length).toBeGreaterThan(0);
      expect(reference.locator.length).toBeGreaterThan(0);
      expect(reference.window.scale).toBe("ut1");
      expect(reference.checks.filter((check) => check.key === "closestApproachTime")).toEqual([
        { key: "closestApproachTime", value: 1717145854, unit: "nominal-ut1-seconds", maximumAbsoluteError: 120 }
      ]);
    }
  });

  it.each(references)("meets the unchanged local-minimum gate: $id", (reference) => {
    const result = searchLocalClosestApproaches({ target: reference.pair[1], observer: reference.observer,
      window: { from: nominalUt1ToInput(reference.window.from), to: nominalUt1ToInput(reference.window.to) } });
    expect(result.status, reference.id).toBe("complete");
    expect(result.events, reference.id).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.receipt.search).toBe(result.receipt);
    const nominalUt1Seconds = Date.UTC(2000, 0, 1, 12) / 1000 + timeBasis(Date.parse(event.at), "utc").ut1Days * 86_400;
    assertReferenceChecks(reference.checks.filter((check) => check.key === "closestApproachTime"),
      { closestApproachTime: nominalUt1Seconds });
  });
});
