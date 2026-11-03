// Check L9 (../PREREGISTRATION.md, section 3): the API reports that
// scripts/api-report.mjs writes from a build equal that tree's api/ (as
// npm run api:check holds them), api/lite.api.md among them, and every other
// file of that api/ is byte for byte its state at --before, the commit before
// the lite entry's (L-c): the entry changes no report but its own. The control:
// the same comparison with api/lite.api.md left out of api/ must report it
// missing, as npm run api:check does.
//
//   node api-reports.mjs --package <dir> --before 874077e [--out report.json]
//
// L9's build is L-c's, 16ad4fe (the amendment "2026-11-03, review 1: L9 and
// L11 on L-c's build" of ../PREREGISTRATION.md, section 11): the cut's later
// commits change api/ for other units (P2.B.vargas's api/vedic.api.md,
// P1.M3c's api/calc.api.md), so L9 cannot hold on the cut's own build. <dir>
// is a scratch copy of 16ad4fe outside every checkout: a sparse, blobless
// clone of this repository checked out at 16ad4fe, made as the
// preregistration's section 0 makes one and as carrier/pack-source.sh's
// sparse_clone makes it (git clone --no-checkout --no-local
// --filter=blob:none, from a local repository with --upload-pack "git -c
// uploadpack.allowFilter=true upload-pack"; then git sparse-checkout set
// --no-cone '/*' '!/docs/evidence/calc-sidereal-2026-10-05/'; then git
// checkout --detach 16ad4fe), never a plain clone or a worktree. git archive
// 16ad4fe -- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05' would do
// only in a repository that holds every blob it reads: in a blobless clone
// such as engine-rc2 it asks the promisor remote for a blob that is not on
// disk even when the pathspec names src/ alone (git 2.50.1), and so would
// fetch it over the network. Then, in <dir>, npm ci and npm run build on
// Node 22.22.2. The tool imports <dir>'s own scripts/api-report.mjs, builds
// the reports from <dir>'s build, compares them with <dir>'s api/, and reads
// the files at --before by name with git cat-file in this checkout's
// repository, which holds the history; no tree is walked. Without --package,
// <dir> is this checkout.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CHECKOUT, finish, options } from "./load.mjs";

const args = options();
if (!args.before) throw new Error("usage: node api-reports.mjs --package <dir> --before <commit> [--out report.json]");
const repository = fileURLToPath(CHECKOUT);
const built = args.package ? resolve(String(args.package)) : repository;
const { buildApiReports } = await import(pathToFileURL(resolve(built, "scripts/api-report.mjs")).href);
const reports = buildApiReports(built);
const committed = Object.fromEntries(readdirSync(resolve(built, "api")).filter((name) => name.endsWith(".api.md")).map((name) => [name, readFileSync(resolve(built, "api", name), "utf8")]));

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

const before = execFileSync("git", ["rev-parse", "--verify", `${args.before}^{commit}`], { cwd: repository, encoding: "utf8" }).trim();
const atBefore = (name) => {
  try {
    return execFileSync("git", ["cat-file", "-p", `${before}:api/${name}`], { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
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
  package: built,
  version: JSON.parse(readFileSync(resolve(built, "package.json"), "utf8")).version,
  before,
  reports: [...reports.keys()],
  apiCheck: check.length === 0 ? "pass" : check,
  liteReport: "lite.api.md" in committed && atBefore("lite.api.md") === null ? "new" : "not new",
  othersUnchanged: others,
  control: { result: control, behaved: control.length === 1 && control[0] === "api/lite.api.md is missing" },
  pass: check.length === 0 && others.every((row) => row.same) && "lite.api.md" in committed && atBefore("lite.api.md") === null &&
    control.length === 1 && control[0] === "api/lite.api.md is missing"
}, args.out);
