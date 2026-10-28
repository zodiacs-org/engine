/**
 * Removes en and em dashes from readings (see dedash.ts).
 *
 *   node_modules/.bin/vite-node bots/astrologer/facts/dedash-cli.ts -- --write reading.md [more.md ...]
 *   node_modules/.bin/vite-node bots/astrologer/facts/dedash-cli.ts -- < reading.md > out.md
 *
 * With --write each file is rewritten in place (only when it changes) and one
 * JSON line per file is printed: {"file", "before", "after", "protected"}.
 * Without files it reads stdin and writes the result to stdout. Exit code 0,
 * or 2 on bad arguments.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dedash } from "./dedash.js";

const args = process.argv.slice(2).filter((a) => a !== "--");
const write = args.includes("--write");
const files = args.filter((a) => !a.startsWith("--"));
if (write && files.length === 0 || !write && files.length > 0) {
  process.stderr.write("Usage: dedash-cli.ts --write reading.md [more.md ...] | dedash-cli.ts < in > out\n");
  process.exit(2);
}
if (!write) {
  process.stdout.write(dedash(readFileSync(0, "utf8")).text);
} else {
  for (const file of files) {
    const input = readFileSync(file, "utf8");
    const r = dedash(input);
    if (r.text !== input) writeFileSync(file, r.text);
    process.stdout.write(JSON.stringify({ file, before: r.before, after: r.after, protected: r.protectedDashes }) + "\n");
  }
}
