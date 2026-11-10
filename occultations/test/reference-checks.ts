import assert from "node:assert/strict";

/** Test-only acceptance contract. Values are on the reference's stated scale. */
export interface ReferenceCheck {
  readonly key: string;
  readonly value: number;
  readonly unit: string;
  readonly maximumAbsoluteError: number;
  readonly difference?: "circular-degrees";
}

/** Missing, extra, nonfinite or out-of-budget results fail, including refusals. */
export function assertReferenceChecks(
  checks: readonly ReferenceCheck[],
  actual: Readonly<Record<string, number>>
): void {
  assert(checks.length > 0, "a reference must assert a result");
  const keys = checks.map((check) => check.key);
  assert.equal(new Set(keys).size, keys.length, "duplicate reference check");
  assert.deepEqual(Object.keys(actual).sort(), [...keys].sort(), "reference result coverage");
  for (const check of checks) {
    assert(check.key.length > 0 && check.unit.length > 0, "check needs a key and units");
    assert(Number.isFinite(check.value), "reference value must be finite");
    assert(Number.isFinite(check.maximumAbsoluteError) && check.maximumAbsoluteError >= 0,
      "maximum error must be finite and nonnegative");
    const value = actual[check.key]!;
    assert(Number.isFinite(value), `${check.key}: result must be finite`);
    const delta = value - check.value;
    const error = check.difference === "circular-degrees"
      ? Math.abs(((delta % 360) + 540) % 360 - 180)
      : Math.abs(delta);
    assert(error <= check.maximumAbsoluteError,
      `${check.key}: error ${error} ${check.unit} exceeds ${check.maximumAbsoluteError}`);
  }
}
