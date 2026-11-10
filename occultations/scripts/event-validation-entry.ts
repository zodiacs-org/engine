import { runEventValidation } from "../test/event-validation.js";
import type { ReferencePartition } from "../test/event-validation.js";

const args = process.argv.slice(2);
if (args.length !== 1 || !["development", "held-out", "all"].includes(args[0]!)) {
  throw new Error("Expected exactly one partition: development, held-out or all.");
}
const partitions: ReferencePartition[] = args[0] === "all" ? ["development", "held-out"] : [args[0] as ReferencePartition];
const report = runEventValidation(partitions);
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (!report.passed) process.exitCode = 1;
