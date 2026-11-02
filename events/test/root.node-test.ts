import assert from "node:assert/strict";
import { test } from "node:test";
import { refineRoot } from "../src/index.js";

// These independently defined analytic functions test the numerical method.
// No expected astronomical date is derived from an engine calculation.
test("linear zero, either direction, with every evaluation inside the bracket", () => {
  for (const direction of [-1, 1]) {
    const visited: number[] = [];
    const result = refineRoot(t => {
      visited.push(t);
      assert.ok(Number.isInteger(t) && t >= -100 && t <= 100);
      return direction * (t - 17);
    }, -100, 100);
    assert.equal(result.status, "converged");
    if (result.status !== "converged") return;
    assert.equal(result.atMs, 17);
    assert.equal(result.value, direction * 0);
    assert.equal(result.evaluations, visited.length);
  }
});

test("noninteger polynomial root is enclosed to the requested width", () => {
  const expected = Math.sqrt(2) * 1000;
  for (const toleranceMs of [1, 7, 100]) {
    const result = refineRoot(t => t * t - 2_000_000, 1000, 2000, { toleranceMs });
    assert.equal(result.status, "converged");
    if (result.status !== "converged") return;
    const [lo, hi] = result.bracket;
    assert.ok(lo <= expected && expected <= hi);
    assert.ok(hi - lo <= toleranceMs);
    assert.ok(Math.abs(result.atMs - expected) <= toleranceMs);
    assert.equal(result.value, result.atMs * result.atMs - 2_000_000);
  }
});

test("inclusive endpoints and degenerate exact zero", () => {
  for (const expected of [10, 20]) {
    const result = refineRoot(t => t - expected, 10, 20);
    assert.equal(result.status, "converged");
    if (result.status === "converged") assert.equal(result.atMs, expected);
  }
  assert.deepEqual(refineRoot(() => 0, 10, 10), {
    status: "converged", atMs: 10, value: 0, bracket: [10, 10], evaluations: 1
  });
  assert.throws(() => refineRoot(() => 1, 10, 10), RangeError);
});

test("budget exhaustion is explicit and does not return a root", () => {
  let calls = 0;
  const result = refineRoot(t => { calls++; return t - 0.25; }, 0, 100, { maxEvaluations: 3 });
  assert.deepEqual(result, {
    status: "refused", reason: "evaluation-budget", bracket: [0, 50], evaluations: 3
  });
  assert.equal(calls, 3);
  assert.ok(!("atMs" in result));
  assert.equal(refineRoot(t => t - 0.25, 0, 1, { maxEvaluations: 2 }).status, "converged");
});

test("sign decisions avoid underflow and overflow from multiplying residuals", () => {
  for (const scale of [Number.MIN_VALUE, 1e308]) {
    const result = refineRoot(t => t < 3 ? -scale : t > 3 ? scale : 0, 0, 8);
    assert.equal(result.status, "converged");
    if (result.status === "converged") assert.equal(result.atMs, 3);
    assert.throws(() => refineRoot(() => scale, 0, 8), RangeError);
  }
});

test("large positive and negative epoch coordinates retain integer resolution", () => {
  for (const base of [-8.64e15, 8.64e15 - 100]) {
    const result = refineRoot(t => t - (base + 37), base, base + 100);
    assert.equal(result.status, "converged");
    if (result.status === "converged") assert.equal(result.atMs, base + 37);
  }
  const result = refineRoot(t => t - 0.25, -8.64e15, 8.64e15);
  assert.equal(result.status, "converged");
  if (result.status === "converged") assert.deepEqual(result.bracket, [0, 1]);
});

test("invalid intervals and options reject before calling the function", () => {
  let calls = 0;
  const fn = (): number => { calls++; return 0; };
  for (const [from, to] of [[NaN, 2], [0, Infinity], [0.5, 2], [3, 2], [0, 8.64e15 + 1]]) {
    assert.throws(() => refineRoot(fn, from!, to!), RangeError);
  }
  for (const toleranceMs of [0, -1, 0.5, NaN, Infinity]) {
    assert.throws(() => refineRoot(fn, 0, 2, { toleranceMs }), RangeError);
  }
  for (const maxEvaluations of [0, 1, 2.5, NaN, Infinity]) {
    assert.throws(() => refineRoot(fn, 0, 2, { maxEvaluations }), RangeError);
  }
  assert.equal(calls, 0);
});

test("nonfinite callback values and missing sign brackets reject", () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.throws(() => refineRoot(() => bad, 0, 10), RangeError);
    assert.throws(() => refineRoot(t => t === 0 ? -1 : t === 10 ? 1 : bad, 0, 10), RangeError);
  }
  assert.throws(() => refineRoot(t => t * t + 1, -10, 10), RangeError);
  // A double root requires a different bracket-discovery strategy.
  assert.throws(() => refineRoot(t => (t - 3) ** 2, 0, 10), RangeError);
});
