import assert from "node:assert/strict";
import { relative, sep } from "node:path";

// Each numeric suite prints one machine-readable record only in report mode.
// Keep its boundary counters and examples together with its observed maxima.
export const REPORT_KEYS = Object.freeze([
  "frameParityMaxima", "planetParityMaxima", "moonParityMaxima",
  "plutoParityMaxima", "positionsParityMaxima", "housesParityMaxima",
  "quadrantHousesParityMaxima", "houseCorpusParity", "aspectCorpusParity"
]);

export function collectMeasurements(stdout, keys = REPORT_KEYS) {
  const measurements = {};
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith("{")) continue;
    const record = JSON.parse(line);
    const matches = keys.filter((key) => Object.hasOwn(record, key));
    assert.equal(matches.length, 1, "Unrecognized or ambiguous parity measurement record.");
    const key = matches[0];
    assert(!Object.hasOwn(measurements, key), `Duplicate parity report: ${key}`);
    measurements[key] = record;
  }
  assert.deepEqual(Object.keys(measurements).sort(), [...keys].sort(), "Missing parity measurement reports.");
  return Object.fromEntries(Object.entries(measurements).sort(([a], [b]) => a.localeCompare(b)));
}

export function summarizeTests(report, root, expectedFiles) {
  assert.equal(report.success, true, "Vitest did not report a successful run.");
  assert.equal(report.numFailedTests, 0, "Parity tests failed.");
  assert.equal(report.numPendingTests, 0, "Skipped parity tests cannot establish corpus coverage.");
  assert.equal(report.numTodoTests, 0, "Todo parity tests cannot establish corpus coverage.");
  assert(report.numTotalTests > 0, "An empty run cannot establish parity.");
  assert.equal(report.numPassedTests, report.numTotalTests, "Not every parity test passed.");
  const suites = report.testResults.map((suite) => {
    const file = relative(root, suite.name).split(sep).join("/");
    assert.equal(suite.status, "passed", `Parity suite did not pass: ${file}`);
    assert(suite.assertionResults.length > 0, `Empty parity suite: ${file}`);
    const tests = suite.assertionResults.map((result) => {
      assert.equal(result.status, "passed", `Parity test did not pass: ${result.fullName}`);
      return result.fullName;
    });
    return { file, tests };
  }).sort((a, b) => a.file.localeCompare(b.file));
  assert.deepEqual(suites.map(({ file }) => file).sort(), [...expectedFiles].sort(),
    "Parity report must cover every discovered parity file exactly once.");
  assert.equal(suites.reduce((count, suite) => count + suite.tests.length, 0), report.numTotalTests,
    "Vitest totals disagree with the reported test cases.");
  return { files: suites.length, passed: report.numPassedTests, suites };
}
