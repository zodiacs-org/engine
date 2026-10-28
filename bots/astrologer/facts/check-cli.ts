/**
 * Checks a reading against its facts sheet (see check-reading.ts).
 *
 *   node_modules/.bin/vite-node bots/astrologer/facts/check-cli.ts -- --sheet sheet.txt --reading reading.md [--json]
 *
 * Exit code 0 when the reading passes, 1 when it has a violation, 2 on bad
 * arguments. Without --json it prints "ok" or the numbered violations; with
 * --json it prints the CheckResult.
 */
import { readFileSync } from "node:fs";
import { checkReading, formatViolations } from "./check-reading.js";

const args = process.argv.slice(2).filter((a) => a !== "--");
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const sheetPath = value("--sheet");
const readingPath = value("--reading");
if (!sheetPath || !readingPath) {
  process.stderr.write("Usage: check-cli.ts --sheet sheet.txt --reading reading.md [--json]\n");
  process.exit(2);
}
const result = checkReading(readFileSync(sheetPath, "utf8"), readFileSync(readingPath, "utf8"));
process.stdout.write(args.includes("--json") ? JSON.stringify(result, null, 2) + "\n" : result.ok ? `ok (${result.mentions} mentions)\n` : formatViolations(result) + "\n");
process.exit(result.ok ? 0 : 1);
