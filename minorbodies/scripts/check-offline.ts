/** Explicit, read-only offline preflight. Never fetches, fits or installs. */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { readLocalBounded, verifyInstalledDependencies, verifyFinalEventFiles } from "./offline-integrity.ts";

export function parseOfflineArguments(args: readonly string[]): "pilot" | "full" | "help" {
  if (args.length === 0) return "pilot";
  if (args.length === 1 && args[0] === "--full") return "full";
  if (args.length === 1 && args[0] === "--help") return "help";
  throw new RangeError("Usage: npm run offline:check -- [--full|--help]");
}

export async function checkOffline(mode: "pilot" | "full") {
  const checks: { name: string; status: "ok" | "failed"; detail?: unknown }[] = [];
  async function check(name: string, run: () => Promise<unknown>) {
    try { checks.push({ name, status: "ok", detail: await run() }); }
    catch (error) {
      checks.push({ name, status: "failed", detail: error instanceof Error ? error.message.slice(0, 2000) : "Readiness check failed." });
    }
  }
  await check("node-runtime", async () => {
    assert.equal(process.version, "v22.22.2", "Use the frozen generator's Node 22.22.2 runtime.");
    return process.version;
  });
  await check("installed-dependencies", verifyInstalledDependencies);
  // Avoid an opaque module-resolution failure when installation itself is missing.
  if (checks.every(item => item.status === "ok")) {
    await check("independent-reference-environment", async () => {
      const { reduceWithIndependentErfa } = await import("../src/pilot-validation.ts");
      const result = await reduceWithIndependentErfa([{ jdTt: 2451545, positionAu: [1, 0, 0] }]);
      return result.reference;
    });
    await check("pilot-sources-and-coefficients", async () => {
      const { pilotGeneratorIdentity } = await import("./generate-pilot.ts");
      const manifest = JSON.parse((await readLocalBounded(new URL("../tests/fixtures/pilot/manifest.json", import.meta.url))).toString("utf8")) as { generator: unknown };
      assert.deepEqual(manifest.generator, await pilotGeneratorIdentity());
      const { loadChironPilot } = await import("../src/pilot.ts");
      await loadChironPilot();
      return "Frozen sources and installed pilot verified; run pilot:build if generated pilot files are absent.";
    });
    if (mode === "full") {
      const { MINOR_BODY_NAMES } = await import("../src/catalog.ts");
      for (const body of MINOR_BODY_NAMES) {
        await check(`${body}:full-sources-and-coefficients`, async () => {
          const { verifyFullManifest } = await import("../src/full-sources.ts");
          const { fullGeneratorIdentity } = await import("./generate-full.ts");
          const text = (await readLocalBounded(new URL(`../data/manifests/${body.toLowerCase()}.json`, import.meta.url))).toString("utf8");
          assert.deepEqual(verifyFullManifest(text).sourceManifest.generator, await fullGeneratorIdentity());
          const { loadFullBody } = await import("../src/full.ts");
          await loadFullBody(body);
          return "Frozen original sources, coefficient receipts and joins verified.";
        });
        await check(`${body}:speed-reference-sources`, async () => {
          const { readSpeedBodySources } = await import("../src/speed-reference-sources.ts");
          const result = await readSpeedBodySources(body);
          return { sourceManifestSha256: result.sourceManifestSha256 };
        });
        await check(`${body}:final-position-sources`, async () => {
          const { readFinalBodySources } = await import("../src/final-sources.ts");
          const result = await readFinalBodySources(body);
          return { sourceManifestSha256: result.sourceManifestSha256 };
        });
        await check(`${body}:final-event-sources`, () => verifyFinalEventFiles(body));
      }
    }
  }
  return { schema: "minorbodies-offline-readiness-v1", status: checks.every(item => item.status === "ok") ? "ready" : "failed",
    mode, scope: "local-prerequisites-and-integrity;not-an-accuracy-validation", checks };
}

async function main() {
  const mode = parseOfflineArguments(process.argv.slice(2));
  if (mode === "help") {
    console.log("Usage: npm run offline:check -- [--full|--help]\nChecks installed pilot prerequisites; --full also checks all required full-range sources and coefficients. No network, fitting or accuracy validation.");
    return;
  }
  const result = await checkOffline(mode);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ready") process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); }
  catch (error) {
    console.error(error instanceof Error ? error.message : "Offline readiness check failed.");
    process.exitCode = 1;
  }
}
