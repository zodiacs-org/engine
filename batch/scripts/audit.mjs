import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const FILE_LIMIT = 2_000_000;
const root = fileURLToPath(new URL("../../", import.meta.url));
const generatedDirectory = /^batch\/(?:node_modules|\.cache|\.generated|\.runtime|coverage)(?:\/|$)/;

function inside(root, filename) {
  const path = relative(root, filename);
  return path !== ".." && !path.startsWith("../") && !isAbsolute(path);
}

function prose(text) {
  return text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, "");
}

function headings(text) {
  const seen = new Map();
  return new Set([...prose(text).matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => {
    const slug = match[1].trim().toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, "").replaceAll(" ", "-");
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    return count ? `${slug}-${count}` : slug;
  }));
}

/** Check source files only. Installed dependencies and runtime output are ignored. */
export function auditFiles(repository, files, fileLimit = FILE_LIMIT) {
  const errors = [];
  let links = 0;
  for (const path of files) {
    if (!path.startsWith("batch/") || !inside(resolve(repository, "batch"), resolve(repository, path))) {
      errors.push(`File is outside batch/: ${path}`);
      continue;
    }
    if (generatedDirectory.test(path) || /\.(?:sqlite(?:-(?:wal|shm))?|ndjson|tgz|tsbuildinfo)$/.test(path)) {
      errors.push(`Generated data must remain ignored: ${path}`);
    }
    const filename = resolve(repository, path);
    let stat;
    try {
      stat = lstatSync(filename);
    } catch (error) {
      if (error.code === "ENOENT") continue; // Deleted tracked files have no bytes to check.
      throw error;
    }
    if (!stat.isFile()) {
      errors.push(`Source must be a regular file: ${path}`);
      continue;
    }
    if (stat.size >= fileLimit) errors.push(`File reaches the size limit: ${path}`);
    if (!path.endsWith(".md") && !path.endsWith(".txt")) continue;
    const text = readFileSync(filename, "utf8");
    if (text.includes("\u2014")) errors.push(`Documentation contains an em dash: ${path}`);
    // This repository uses ordinary inline Markdown links. External URLs are
    // intentionally not fetched: this verifies local evidence, not availability
    // or authenticity of a third-party site.
    for (const match of prose(text).matchAll(/\[[^\]\n]+\]\(([^\s)]+)\)/g)) {
      const href = match[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      links++;
      let target;
      let fragment;
      try {
        const hash = href.indexOf("#");
        target = decodeURIComponent(hash < 0 ? href : href.slice(0, hash));
        fragment = hash < 0 ? "" : decodeURIComponent(href.slice(hash + 1));
      } catch {
        errors.push(`Invalid link in ${path}: ${href}`);
        continue;
      }
      const destination = target ? resolve(dirname(filename), target) : filename;
      if (!inside(repository, destination) || !existsSync(destination)
        || !inside(realpathSync(repository), realpathSync(destination))) {
        errors.push(`Missing or external local link in ${path}: ${href}`);
      } else if (fragment && destination.endsWith(".md")
        && !headings(readFileSync(destination, "utf8")).has(fragment)) {
        errors.push(`Missing heading in ${path}: ${href}`);
      }
    }
  }
  return { files: files.length, links, errors };
}

function gitPaths(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
}

export function auditRepository() {
  const files = [...new Set(gitPaths(["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "batch/"]))];
  const report = auditFiles(root, files);
  const changes = [...new Set([
    ...gitPaths(["diff", "--name-only", "-z", "HEAD", "--"]),
    ...gitPaths(["ls-files", "-z", "--others", "--exclude-standard"]),
  ])];
  for (const path of changes) {
    if (!path.startsWith("batch/")) report.errors.push(`Working tree change outside batch/: ${path}`);
  }
  // --dry-run lists the current package without producing an archive;
  // --ignore-scripts is essential because the root prepack builds dist/.
  const packed = JSON.parse(execFileSync("npm", [
    "pack", "--dry-run", "--ignore-scripts", "--json", "--cache", resolve(root, "batch/.cache/npm"),
  ], { cwd: root, encoding: "utf8", maxBuffer: FILE_LIMIT, stdio: ["ignore", "pipe", "pipe"] }));
  report.packageIsolation = "passed";
  if (packed.length !== 1 || !Array.isArray(packed[0].files) || !packed[0].files.length) {
    report.packageIsolation = "failed";
    report.errors.push("Unexpected npm pack dry-run response.");
  } else if (packed[0].files.some(({ path }) => path === "batch" || path.startsWith("batch/"))) {
    report.packageIsolation = "failed";
    report.errors.push("The engine package includes batch/ files.");
  }
  report.engineBuildPresent = existsSync(resolve(root, "dist/calc.d.ts"));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) throw new Error("Usage: node scripts/audit.mjs");
    const report = auditRepository();
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    if (report.errors.length) process.exitCode = 1;
    if (!report.engineBuildPresent) {
      process.stdout.write("Root package:contents requires the absent engine dist/; this audit verifies exclusion only.\n");
    }
  } catch (error) {
    process.stderr.write(`Batch audit failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
