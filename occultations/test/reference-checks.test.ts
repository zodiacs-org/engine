import { describe, expect, it } from "vitest";
import { assertReferenceChecks, type ReferenceCheck } from "./reference-checks.js";

// Synthetic arithmetic only. These are tests of the future comparison gate,
// not comparisons of any astronomical result with a published prediction.
const checks: ReferenceCheck[] = [
  { key: "disappearance", value: 1000, unit: "seconds", maximumAbsoluteError: 2 },
  { key: "reappearance", value: 2000, unit: "seconds", maximumAbsoluteError: 2 }
];

describe("published-reference maximum-error gate", () => {
  it("accepts both inclusive error boundaries", () => {
    expect(() => assertReferenceChecks(checks, { disappearance: 998, reappearance: 2002 })).not.toThrow();
  });

  it("compares position angles across north without wrapping latitude errors", () => {
    const pa: ReferenceCheck = { key: "pa", value: 359, unit: "degrees", maximumAbsoluteError: 2,
      difference: "circular-degrees" };
    expect(() => assertReferenceChecks([pa], { pa: 1 })).not.toThrow();
    expect(() => assertReferenceChecks([pa], { pa: 2 })).toThrow(/exceeds/);
    const linear: ReferenceCheck = { key: "pa", value: 359, unit: "degrees", maximumAbsoluteError: 2 };
    expect(() => assertReferenceChecks([linear], { pa: 1 })).toThrow(/exceeds/);
  });

  it("refuses one bad contact even if the mean or signed error would pass", () => {
    expect(() => assertReferenceChecks(checks, { disappearance: 997, reappearance: 2001 })).toThrow(/exceeds/);
    expect(() => assertReferenceChecks(checks, { disappearance: 997, reappearance: 2003 })).toThrow(/exceeds/);
  });

  it("cannot pass an omitted, extra, duplicated or refused result", () => {
    expect(() => assertReferenceChecks(checks, { disappearance: 1000 })).toThrow(/coverage/);
    expect(() => assertReferenceChecks(checks, { disappearance: 1000, reappearance: 2000, extra: 0 })).toThrow(/coverage/);
    expect(() => assertReferenceChecks(checks, {})).toThrow(/coverage/);
    expect(() => assertReferenceChecks([checks[0]!, checks[0]!], { disappearance: 1000 })).toThrow(/duplicate/);
    expect(() => assertReferenceChecks([], {})).toThrow(/must assert/);
  });

  it.each([NaN, Infinity, -Infinity])("refuses a nonfinite result %s", (value) => {
    expect(() => assertReferenceChecks(checks, { disappearance: value, reappearance: 2000 })).toThrow(/finite/);
  });

  it.each([-1, NaN, Infinity])("refuses an invalid budget %s", (maximumAbsoluteError) => {
    expect(() => assertReferenceChecks([{ ...checks[0]!, maximumAbsoluteError }], { disappearance: 1000 }))
      .toThrow(/maximum error/);
  });
});
