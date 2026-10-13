import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, lstatSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const commit = "7d6fb88d03b3896ee1e5496ed99961015d291d3c";
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const vendor = join(repository, "webhook/vendor/events");
const modules = [
  "aspects.ts", "context.ts", "eclipses.ts", "engine.ts", "longitude.ts", "root.ts", "stations.ts", "types.ts"
];
const originalImport = "'../../src/calc.js'";
const localImport = "'../../../../src/calc.js'";
const maxBytes = 2_000_000;
const manifestPath = join(vendor, "manifest.json");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const encode = (value) => JSON.stringify(value, null, 2) + "\n";

function regularFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size >= maxBytes) throw new Error(`Invalid vendored file: ${path}`);
  return readFileSync(path);
}

function transform(source, name, reverse = false) {
  const from = reverse ? localImport : originalImport;
  const to = reverse ? originalImport : localImport;
  const expected = name === "engine.ts" ? 2 : name === "eclipses.ts" ? 1 : 0;
  const value = source.toString("utf8");
  if (!Buffer.from(value).equals(source) || value.split(from).length - 1 !== expected || value.includes(to)) {
    throw new Error(`Unexpected source imports or encoding: ${name}`);
  }
  return Buffer.from(value.replaceAll(from, to));
}

function entry(name, upstream, local) {
  return {
    source: `events/src/${name}`,
    file: `src/${name}`,
    upstreamSha256: hash(upstream),
    localSha256: hash(local)
  };
}

function manifest(files) {
  return {
    schema: "zodiacs-webhook-events-vendor/1",
    repository: "https://github.com/zodiacs-org/engine",
    commit,
    transformation: { from: originalImport, to: localImport },
    files
  };
}

function check() {
  const files = readdirSync(join(vendor, "src")).sort();
  if (JSON.stringify(files) !== JSON.stringify(modules)) throw new Error("Unexpected vendored module inventory.");
  const entries = modules.map((name) => {
    const local = regularFile(join(vendor, "src", name));
    return entry(name, transform(local, name, true), local);
  });
  // Reversing the only permitted rewrite reconstructs each upstream byte stream.
  // This check needs no git executable, repository objects or network access.
  const expected = Buffer.from(encode(manifest(entries)));
  if (!regularFile(manifestPath).equals(expected)) throw new Error("Vendored source does not match its pinned manifest.");
}

function sync() {
  const snapshots = modules.map((name) => {
    const source = execFileSync("git", ["--no-replace-objects", "show", `${commit}:events/src/${name}`], {
      cwd: repository, maxBuffer: maxBytes, encoding: "buffer", stdio: ["ignore", "pipe", "pipe"]
    });
    if (source.length >= maxBytes) throw new Error(`Upstream module is too large: ${name}`);
    return { name, source, local: transform(source, name) };
  });
  mkdirSync(join(vendor, "src"), { recursive: true });
  // Read the complete pinned set before writing. Never remove unexpected files.
  for (const { name, local } of snapshots) {
    writeFileSync(join(vendor, "src", name), local);
  }
  writeFileSync(manifestPath, encode(manifest(snapshots.map(({ name, source, local }) => entry(name, source, local)))));
  check();
}

try {
  const mode = process.argv[2] ?? "--check";
  if (process.argv.length > 3 || !["--check", "--sync", "--refresh"].includes(mode)) {
    throw new Error("Usage: node scripts/sync-events-vendor.mjs [--check|--sync|--refresh]");
  }
  if (mode === "--check") check();
  else sync();
  process.stdout.write(`Pinned events source verified at ${commit}.\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Events source verification failed."}\n`);
  process.exitCode = 1;
}
