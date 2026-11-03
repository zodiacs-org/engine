// Check L9 (../PREREGISTRATION.md, section 3): the API reports that
// scripts/api-report.mjs writes from this checkout's build equal api/ (as
// npm run api:check holds them), api/lite.api.md among them, and every other
// file of api/ is byte for byte its state at --before, the commit before the
// lite entry's (L-c): the entry changes no report but its own. The control:
// the same comparison with api/lite.api.md left out of api/ must report it
// missing, as npm run api:check does.
//
//   node api-reports.mjs --before <commit> [--out report.json]
//
// Run it after npm run build. The files at --before are read by name with
// git cat-file; no tree is walked.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CHECKOUT, finish, options } from "./load.mjs";

const args = options();
if (!args.before) throw new Error("usage: node api-reports.mjs --before <commit> [--out report.json]");
const { buildApiReports } = await import(new URL("scripts/api-report.mjs", CHECKOUT).href);
const checkout = fileURLToPath(CHECKOUT);
const reports = buildApiReports(checkout);
const committed = Object.fromEntries(readdirSync(new URL("api/", CHECKOUT)).filter((name) => name.endsWith(".api.md")).map((name) => [name, readFileSync(new URL(`api/${name}`, CHECKOUT), "utf8")]));

/** What npm run api:check reports for `files`, a map from name to text standing for api/. */
function problems(files) {
  const out = [];
  for (const [name, text] of reports) {
    if (!(name in files)) out.push(`api/${name} is missing`);
    else if (files[name] !== text) out.push(`api/${name} differs from the build's declarations`);
  }
  for (const name of Object.keys(files)) if (!reports.has(name)) out.push(`api/${name} names no public entry point`);
  return out;
}

const before = execFileSync("git", ["rev-parse", "--verify", `${args.before}^{commit}`], { cwd: checkout, encoding: "utf8" }).trim();
const atBefore = (name) => {
  try {
    return execFileSync("git", ["cat-file", "-p", `${before}:api/${name}`], { cwd: checkout, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};
const others = Object.keys(committed).filter((name) => name !== "lite.api.md").map((name) => ({ name, same: atBefore(name) === committed[name] }));
const check = problems(committed);
const { ["lite.api.md"]: _lite, ...withoutLite } = committed;
const control = problems(withoutLite);
finish({
  check: "L9",
  before,
  reports: [...reports.keys()],
  apiCheck: check.length === 0 ? "pass" : check,
  liteReport: "lite.api.md" in committed && atBefore("lite.api.md") === null ? "new" : "not new",
  othersUnchanged: others,
  control: { result: control, behaved: control.length === 1 && control[0] === "api/lite.api.md is missing" },
  pass: check.length === 0 && others.every((row) => row.same) && "lite.api.md" in committed && atBefore("lite.api.md") === null &&
    control.length === 1 && control[0] === "api/lite.api.md is missing"
}, args.out);
