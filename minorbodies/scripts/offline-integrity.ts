/** Local readiness checks, separate from astronomical accuracy validation. */
import assert from "node:assert/strict";
import { lstat, readFile } from "node:fs/promises";
import { sha256 } from "../src/horizons-client.ts";
import type { MinorBody } from "../src/catalog.ts";
import { FINAL_EVENT_RECIPE, finalEventGeneratorIdentity } from "../src/final-event-reference.ts";
import type { FinalEventSourceManifest } from "../src/final-event-reference.ts";

const project = new URL("../", import.meta.url);

/** Never follow a source-file symlink or read a file beyond the project cap. */
export async function readLocalBounded(url: URL): Promise<Buffer> {
  const info = await lstat(url);
  assert(info.isFile() && !info.isSymbolicLink(), `Expected a regular local file: ${url.pathname}`);
  assert(info.size > 0 && info.size < 2_000_000, `Local data file exceeds its size limits: ${url.pathname}`);
  const bytes = await readFile(url);
  assert.equal(bytes.byteLength, info.size, "Local file changed while being read.");
  return bytes;
}

export async function verifyPinnedLocalFile(url: URL, pin: Readonly<{ byteLength: number; sha256: string }>) {
  assert(Number.isSafeInteger(pin.byteLength) && pin.byteLength > 0 && pin.byteLength < 2_000_000);
  assert(/^[a-f0-9]{64}$/.test(pin.sha256));
  const bytes = await readLocalBounded(url);
  assert.equal(bytes.byteLength, pin.byteLength, `Local source byte length differs: ${url.pathname}`);
  assert.equal(sha256(bytes), pin.sha256, `Local source digest differs: ${url.pathname}`);
}

/** Checks direct installed tools against both package.json and the npm lock. */
export async function verifyInstalledDependencies(root: URL = project) {
  const manifest = JSON.parse((await readLocalBounded(new URL("package.json", root))).toString("utf8")) as {
    devDependencies: Record<string, string>;
  };
  const lock = JSON.parse((await readLocalBounded(new URL("package-lock.json", root))).toString("utf8")) as {
    packages: Record<string, { version?: string; devDependencies?: Record<string, string> }>;
  };
  assert.deepEqual(lock.packages[""]?.devDependencies, manifest.devDependencies, "Dependency lock differs from package.json.");
  const versions: Record<string, string> = {};
  for (const [name, expected] of Object.entries(manifest.devDependencies)) {
    assert(/^(?:@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(name));
    assert(/^\d+\.\d+\.\d+$/.test(expected), "Direct dependencies must retain exact version pins.");
    assert.equal(lock.packages[`node_modules/${name}`]?.version, expected, `Lock version differs for ${name}.`);
    const installed = JSON.parse((await readLocalBounded(new URL(`node_modules/${name}/package.json`, root))).toString("utf8")) as {
      version: string;
    };
    assert.equal(installed.version, expected, `Installed version differs for ${name}; run the documented npm ci setup.`);
    versions[name] = expected;
  }
  return versions;
}

/** The committed digest pins the entire event capture, including its request. */
export async function verifyFinalEventFiles(body: MinorBody) {
  const manifest = JSON.parse((await readLocalBounded(new URL(`data/final-event-manifests/${body.toLowerCase()}.json`, project))).toString("utf8")) as FinalEventSourceManifest;
  assert.deepEqual(Object.keys(manifest), ["schema", "body", "recipe", "generator", "captures"]);
  assert.equal(manifest.schema, "minorbodies-final-event-sources-v1");
  assert.equal(manifest.body, body);
  assert.deepEqual(manifest.recipe, FINAL_EVENT_RECIPE);
  assert.deepEqual(manifest.generator, await finalEventGeneratorIdentity());
  assert(Array.isArray(manifest.captures) && manifest.captures.length > 0);
  const seen = new Set<string>();
  for (const capture of manifest.captures) {
    assert.deepEqual(Object.keys(capture), ["name", "sha256", "byteLength"]);
    assert(/^\d{4}-(?:scan|station-\d+-pass-\d+|ingress-pass-\d+|ingress-endpoints)$/.test(capture.name));
    assert(!seen.has(capture.name), "Duplicate event capture.");
    seen.add(capture.name);
    await verifyPinnedLocalFile(new URL(`generated/final-events/${body.toLowerCase()}/${capture.name}.json`, project), capture);
  }
  return { captures: manifest.captures.length };
}
