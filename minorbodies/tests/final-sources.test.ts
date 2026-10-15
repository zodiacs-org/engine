import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { MINOR_BODY_NAMES } from "../src/catalog.ts";
import { encodeFinalManifest, finalGeneratorIdentity, verifyFinalManifest } from "../src/final-sources.ts";

describe("frozen final source manifests", () => {
  it("binds every required body to its original fit solution and registered requests", async () => {
    const generator = await finalGeneratorIdentity();
    for (const body of MINOR_BODY_NAMES) {
      const name = body.toLowerCase();
      const base = await readFile(new URL(`../data/manifests/${name}.json`, import.meta.url), "utf8");
      const text = await readFile(new URL(`../data/final-manifests/${name}.json`, import.meta.url), "utf8");
      const { source } = verifyFinalManifest(text, base);
      expect(source.body).toBe(body);
      expect(source.generator).toEqual(generator);
    }
  }, 30000);
  it("rejects substituted sources, incomplete captures and changes to the registered recipe", async () => {
    const base = await readFile(new URL("../data/manifests/chiron.json", import.meta.url), "utf8");
    const text = await readFile(new URL("../data/final-manifests/chiron.json", import.meta.url), "utf8");
    for (const mutate of [
      (s: any) => { s.baseSourceManifestSha256 = "0".repeat(64); },
      (s: any) => { s.recipe.seed++; },
      (s: any) => { s.entries.pop(); },
      (s: any) => { s.entries[0].requestSha256 = "0".repeat(64); },
      (s: any) => { s.entries[0].responseSha256 = "bad"; },
      (s: any) => { s.entries[0].identity.targetSource = "JPL#1"; },
      (s: any) => { s.entries[0].byteLength = 2_000_000; },
      (s: any) => { s.generator.files[0].path = "wrong"; }
    ]) {
      const source = JSON.parse(text);
      mutate(source);
      expect(() => verifyFinalManifest(encodeFinalManifest(source), base)).toThrow();
    }
  });
});
