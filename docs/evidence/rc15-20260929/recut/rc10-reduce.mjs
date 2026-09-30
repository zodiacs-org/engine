// Reduces the full report of scripts/verify-rc10-compatibility.mjs for the
// repository, as the first cut's rc10-compatibility.json was reduced: the
// fixtures (fixtureSha256 identifies them), the list of calls
// (operationTrace.calls) and the file inventories are left out, each failed
// check keeps three of its mismatch examples, and the checks are counted by
// category (the part of each id before its first colon). Local paths become
// the placeholders given.
//
//   node rc10-reduce.mjs <full report> <baseline placeholder> <candidate placeholder> > rc10-compatibility.json
import { readFileSync } from "node:fs";

const [path, baselineLabel, candidateLabel] = process.argv.slice(2);
const full = JSON.parse(readFileSync(path, "utf8"));
const { fixtures, ...report } = full;
const { files: baselineFiles, ...baseline } = report.metadata.baseline;
const { files: candidateFiles, ...candidate } = report.metadata.candidate;
report.metadata = { ...report.metadata, baseline: { ...baseline, sourcePath: baselineLabel }, candidate: { ...candidate, artifactPath: candidateLabel } };
const { calls, ...trace } = report.operationTrace;
report.operationTrace = trace;
report.checks = report.checks.map((check) =>
  check.passed ? { id: check.id, passed: true } : { id: check.id, passed: false, mismatchCount: check.mismatchCount, mismatches: check.mismatches.slice(0, 3) }
);
report.reduced =
  "Reduced for the repository from the script's full report: the fixtures (fixtureSha256 identifies them), the list of calls (operationTrace.calls) and the file inventories are left out, and each failed check keeps three of its mismatch examples.";
const categories = {};
for (const check of report.checks) {
  const category = check.id.split(":")[0];
  categories[category] ??= { passed: 0, failed: 0 };
  categories[category][check.passed ? "passed" : "failed"] += 1;
}
report.checksByCategory = categories;
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
