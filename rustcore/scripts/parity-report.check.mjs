import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { collectMeasurements, summarizeTests } from "./parity-report-lib.mjs";

test("measurement collection retains deviations and refuses incomplete or ambiguous evidence", () => {
  const rows = ['{"a":{"longitudeArcsec":0},"deviations":2}', '{"b":{"cases":3}}'];
  const output = `Vitest output\n${rows.join("\n")}\n`;
  assert.deepEqual(collectMeasurements(output, ["a", "b"]), {
    a: { a: { longitudeArcsec: 0 }, deviations: 2 }, b: { b: { cases: 3 } }
  });
  assert.throws(() => collectMeasurements(rows[0], ["a", "b"]), /Missing/);
  assert.throws(() => collectMeasurements(`${output}${rows[0]}`, ["a", "b"]), /Duplicate/);
  assert.throws(() => collectMeasurements('{"a":{},"b":{}}', ["a", "b"]), /ambiguous/);
  assert.throws(() => collectMeasurements('{"a":', ["a"]), SyntaxError);
});

test("coverage summary refuses filtered, skipped, empty, failed or inconsistent test runs", () => {
  const root = resolve("synthetic-workspace");
  const file = "tests/synthetic.parity.ts";
  const good = () => ({ success: true, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    numTotalTests: 1, numPassedTests: 1,
    testResults: [{ name: join(root, file), status: "passed",
      assertionResults: [{ fullName: "synthetic comparison", status: "passed" }] }] });
  assert.deepEqual(summarizeTests(good(), root, [file]), {
    files: 1, passed: 1, suites: [{ file, tests: ["synthetic comparison"] }]
  });
  assert.throws(() => summarizeTests(good(), root, [file, "tests/missing.parity.ts"]), /every discovered/);
  for (const patch of [{ success: false }, { numFailedTests: 1 }, { numPendingTests: 1 },
    { numTodoTests: 1 }, { numTotalTests: 0 }, { numPassedTests: 0 },
    { numTotalTests: 2, numPassedTests: 2 }])
    assert.throws(() => summarizeTests({ ...good(), ...patch }, root, [file]));
  for (const status of ["pending", "failed", "todo"]) {
    const report = good();
    report.testResults[0].assertionResults[0].status = status;
    assert.throws(() => summarizeTests(report, root, [file]), /did not pass/);
  }
  const empty = good();
  empty.testResults[0].assertionResults = [];
  assert.throws(() => summarizeTests(empty, root, [file]), /Empty/);
  const duplicate = good();
  duplicate.testResults.push(duplicate.testResults[0]);
  assert.throws(() => summarizeTests(duplicate, root, [file]), /exactly once/);
});
