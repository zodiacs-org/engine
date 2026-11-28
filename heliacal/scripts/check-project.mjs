// This working-tree audit never changes git metadata or builds the engine.
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const MAX_FILE_BYTES = 2_000_000;
const PROJECT = "heliacal";
const IGNORED_DIRECTORIES = ["node_modules", ".cache", "generated", "coverage"];
const DOCUMENT = /\.(?:md|mdx|markdown|txt|rst)$/i;
const SOURCE = /\.[cm]?[jt]sx?$/i;

function below(root, target) {
  const tail = relative(root, target);
  return tail !== "" && tail !== ".." && !tail.startsWith(`..${sep}`) && !isAbsolute(tail);
}

/** Check declared library imports, including type imports and literal import().
 * This is a source boundary check, not a proof of purity or a code sandbox.
 * In particular it does not inspect eval, global calls or transitive engine code.
 */
export function auditSourceImports(filename, source, root) {
  const violations = [];
  const sourceRoot = resolve(root, PROJECT, "src");
  const engineRoot = resolve(root, "src");
  const absolute = resolve(root, filename);
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  function inspect(node) {
    if (!node || !ts.isStringLiteralLike(node)) {
      violations.push(`${filename}: computed import/require is outside the static import audit.`);
      return;
    }
    const specifier = node.text;
    if (!(specifier.startsWith("./") || specifier.startsWith("../"))) {
      violations.push(`${filename}: library import must be relative to project or engine source: ${specifier}`);
      return;
    }
    const target = resolve(dirname(absolute), specifier);
    if (!below(sourceRoot, target) && !below(engineRoot, target)) {
      violations.push(`${filename}: library import leaves project and engine source: ${specifier}`);
    }
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) inspect(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      inspect(node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      inspect(node.argument.literal);
    } else if (ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      inspect(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return violations;
}

/** Inspect the tracked and unignored file names returned by git, without
 * following symlinks or descending into ignored dependency/generated folders.
 */
export function auditFiles(root, filenames) {
  const violations = [];
  let files = 0;
  let sourceFiles = 0;
  for (const filename of [...new Set(filenames)].sort()) {
    const absolute = resolve(root, filename);
    if (!below(resolve(root, PROJECT), absolute)) {
      violations.push(`${filename}: file is outside ${PROJECT}/.`);
      continue;
    }
    let stat;
    try {
      stat = lstatSync(absolute);
    } catch (error) {
      // A tracked file deleted in the working tree has no contents to audit.
      if (error.code === "ENOENT") continue;
      throw error;
    }
    files += 1;
    if (!stat.isFile()) {
      violations.push(`${filename}: project files must be regular files, not links or special files.`);
      continue;
    }
    if (stat.size >= MAX_FILE_BYTES) {
      violations.push(`${filename}: ${stat.size} bytes; files must be smaller than ${MAX_FILE_BYTES} bytes.`);
      continue;
    }
    if (filename.split("/").slice(1, -1).some((part) => IGNORED_DIRECTORIES.includes(part))) {
      violations.push(`${filename}: dependency, cache or generated output must stay untracked and ignored.`);
    }
    if (DOCUMENT.test(filename)) {
      const text = readFileSync(absolute, "utf8");
      if (text.includes("\u2014")) violations.push(`${filename}: documentation contains U+2014.`);
    }
    if (filename.startsWith(`${PROJECT}/src/`) && SOURCE.test(filename)) {
      sourceFiles += 1;
      violations.push(...auditSourceImports(filename, readFileSync(absolute, "utf8"), root));
    }
  }
  return { files, sourceFiles, violations };
}

function git(root, args, input) {
  const result = spawnSync("git", ["-c", "core.fsmonitor=false", ...args], {
    cwd: root, encoding: "utf8", input,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }
  });
  if (result.error) throw result.error;
  const absentIgnoreMatch = args[0] === "check-ignore" && result.status === 1;
  if (result.status !== 0 && !absentIgnoreMatch) {
    throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.split("\0").filter(Boolean);
}

export function checkProject(root) {
  const files = git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", PROJECT]);
  const result = auditFiles(root, files);
  const changed = [
    ...git(root, ["diff", "--name-only", "--no-renames", "-z", "HEAD", "--"]),
    ...git(root, ["ls-files", "--others", "--exclude-standard", "-z", "--"])
  ];
  for (const filename of [...new Set(changed)].sort()) {
    if (!filename.startsWith(`${PROJECT}/`)) result.violations.push(`${filename}: working-tree change is outside ${PROJECT}/.`);
  }
  // Probe both immediate and nested names. No probe file is created. --no-index
  // checks the ignore rules even if someone has force-added an ignored file.
  const probes = IGNORED_DIRECTORIES.flatMap((directory) => [
    `${PROJECT}/${directory}/audit-probe`, `${PROJECT}/${directory}/nested/audit-probe`
  ]);
  const ignored = new Set(git(root, ["check-ignore", "--no-index", "--stdin", "-z"], `${probes.join("\0")}\0`));
  for (const filename of probes) {
    if (!ignored.has(filename)) result.violations.push(`${filename}: dependency, cache or generated path is not gitignored.`);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkProject(fileURLToPath(new URL("../..", import.meta.url)));
    if (result.violations.length) {
      for (const violation of result.violations) console.error(violation);
      process.exitCode = 1;
    } else {
      console.log(`Project audit passed: ${result.files} tracked/unignored files, ${result.sourceFiles} library source files.`);
      console.log("Checked file sizes, documentation punctuation, ignored output paths, library imports and working-tree scope.");
      console.log("This does not audit committed branch history, numerical accuracy, provenance, runtime side effects or transitive engine imports.");
      console.log("Run check:package separately for the root npm package exclusion check.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Project audit failed.");
    process.exitCode = 1;
  }
}
