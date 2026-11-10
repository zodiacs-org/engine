import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { MINOR_BODY_NAMES } from "../src/catalog.ts";
import { encodeFullSourceManifest, verifyFullManifest, verifyFullSources } from "../src/full-sources.ts";
import { fullGeneratorIdentity } from "../scripts/generate-full.ts";

const sourceText = () => readFile(new URL("../data/manifests/chiron.json", import.meta.url), "utf8");

describe("frozen full-range request manifests", () => {
  it("checks every required body and frozen generator without needing the bulk sources", async () => {
    const identity = await fullGeneratorIdentity();
    for (const body of MINOR_BODY_NAMES) {
      const text = await readFile(new URL(`../data/manifests/${body.toLowerCase()}.json`, import.meta.url), "utf8");
      const { sourceManifest, requests } = verifyFullManifest(text);
      expect(sourceManifest.body).toBe(body);
      expect(sourceManifest.generator).toEqual(identity);
      expect(sourceManifest.entries).toHaveLength(requests.length);
      expect(Object.isFrozen(sourceManifest.entries[0]!.manifest.identity)).toBe(true);
    }
  }, 30000);

  it("refuses altered roles, requests, digests, clocks, source identities and byte counts", async () => {
    const text = await sourceText();
    const alterations = [
      (v: any) => { v.schema = "other"; },
      (v: any) => { v.body = "Ceres"; },
      (v: any) => { v.recipe.degree++; },
      (v: any) => { v.generator.files[0].sha256 = "0".repeat(64); },
      (v: any) => { v.entries.pop(); },
      (v: any) => { v.entries[0].role = "validation"; },
      (v: any) => { v.entries[0].index++; },
      (v: any) => { v.entries[0].manifest.requestSha256 = "0".repeat(64); },
      (v: any) => { v.entries[0].manifest.responseSha256 = "bad"; },
      (v: any) => { v.entries[0].manifest.signature.version = "1.2"; },
      (v: any) => { v.entries[0].manifest.schema = "nonsense"; },
      (v: any) => { v.entries[0].manifest.generator = "unregistered-generator"; },
      (v: any) => { v.entries[0].manifest.extra = true; },
      (v: any) => { v.entries[0].manifest.byteLength = 1.5; },
      (v: any) => { v.entries[0].manifest.byteLength = 900001; },
      (v: any) => { v.entries[0].manifest.identity.centerSource = "different"; },
      (v: any) => { v.entries[0].manifest.retrievedAt = "tomorrow"; },
      (v: any) => { v.identity.initialPositionAu[0] = null; },
      (v: any) => { v.identity.centerSource = 123; },
      (v: any) => { v.identity.extra = true; }
    ];
    for (const alter of alterations) {
      const source = JSON.parse(text);
      alter(source);
      expect(() => verifyFullManifest(encodeFullSourceManifest(source))).toThrow();
    }
    expect(() => verifyFullManifest(text.trimEnd())).toThrow();
  }, 30000);

  it("does not admit a manifest alone as a verified full source corpus", async () => {
    // The actual frozen manifest is valid, but no original bytes were supplied.
    const text = await sourceText();
    expect(() => verifyFullSources(text, new Map())).toThrow("incomplete or has extra files");
  });
});
