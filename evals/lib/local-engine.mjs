import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, version as esbuildVersion } from "esbuild";

const project = fileURLToPath(new URL("..", import.meta.url));
export const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const json = async (url) => JSON.parse(await readFile(url, "utf8"));
let pending;

export function freezeRecord(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeRecord);
    Object.freeze(value);
  }
  return value;
}

async function load() {
  const [metadata, dependency] = await Promise.all([
    json(new URL("../../package.json", import.meta.url)),
    json(new URL("../node_modules/astronomy-engine/package.json", import.meta.url))
  ]);
  if (metadata.name !== "@zodiacs/engine" || dependency.name !== "astronomy-engine" ||
      metadata.dependencies[dependency.name] !== dependency.version) {
    throw new Error("The eval ephemeris must match the local engine's exact dependency pin.");
  }
  const result = await build({
    absWorkingDir: project,
    entryPoints: ["engine/entry.ts"],
    bundle: true,
    write: false,
    platform: "node",
    target: "node22",
    format: "esm",
    treeShaking: true,
    tsconfigRaw: {},
    logLevel: "silent",
    // An explicit local dependency prevents a different root installation winning resolution.
    alias: { "astronomy-engine": join(project, "node_modules/astronomy-engine/esm/astronomy.js") }
  });
  if (result.outputFiles.length !== 1 || result.outputFiles[0].contents.length >= 2_000_000) {
    throw new Error("The local engine bundle must be one file below the project size limit.");
  }
  const bytes = result.outputFiles[0].contents;
  const cache = join(project, ".cache");
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(join(cache, "engine-"));
  let api;
  try {
    const path = join(directory, "engine.mjs");
    await writeFile(path, bytes, { flag: "wx" });
    api = await import(pathToFileURL(path).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  if (api.ENGINE_VERSION !== metadata.version ||
      api.EPHEMERIS.name !== dependency.name || api.EPHEMERIS.version !== dependency.version) {
    throw new Error("Engine source, package and loaded ephemeris versions disagree.");
  }
  return Object.freeze({
    api,
    // The engine exports a mutable Set copy; its computations use a private set.
    aspectBodies: Object.freeze([...api.ASPECT_BODIES]),
    provenance: freezeRecord({
      engine: {
        name: metadata.name, version: api.ENGINE_VERSION, license: metadata.license,
        source: "local-source", entryPoints: ["src/index.ts", "src/techniques.ts", "src/receipt.ts"]
      },
      ephemeris: { name: dependency.name, version: dependency.version, license: dependency.license },
      bundle: { digest: digest(bytes), bytes: bytes.length, loader: "esbuild", loaderVersion: esbuildVersion },
      runtime: { node: process.versions.node, v8: process.versions.v8, platform: process.platform, arch: process.arch }
    })
  });
}

/** Load one snapshot per process. Restart after source changes. No root build or network. */
export function loadLocalEngine() {
  pending ??= load().catch((error) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
