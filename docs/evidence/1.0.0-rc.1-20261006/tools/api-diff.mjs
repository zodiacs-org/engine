// The public declarations of 0.1.1-rc.17 against this candidate's: rc.17's
// reports written by this checkout's scripts/api-report.mjs from the carried
// rc.17 archive unpacked, and diffed, entry point by entry point, with the
// committed api/ (diff -u). Every difference should be a change the
// CHANGELOG's 1.0.0-rc.1 entry lists.
//
//   node api-diff.mjs <rc.17 package directory> > api-diff.txt
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rc17 = process.argv[2];
if (!rc17) {
  console.error("usage: node api-diff.mjs <rc.17 package directory>");
  process.exit(2);
}
const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const { buildApiReports } = await import(join(checkout, "scripts/api-report.mjs"));
const dir = mkdtempSync(join(tmpdir(), "api-rc17-"));
try {
  for (const [name, text] of buildApiReports(resolve(rc17))) writeFileSync(join(dir, name), text);
  for (const name of readdirSync(join(checkout, "api")).sort()) {
    let out = "";
    try {
      execFileSync("diff", ["-u", "--label", `0.1.1-rc.17/${name}`, "--label", `1.0.0-rc.1/${name}`, join(dir, name), join(checkout, "api", name)], { encoding: "utf8" });
      out = `# ${name}: no difference\n`;
    } catch (error) {
      if (error.status !== 1) throw error;
      out = error.stdout;
    }
    process.stdout.write(out);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
