import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { auditResource } from "../scripts/audit-sources.mjs";

const readJson = (name) => JSON.parse(readFileSync(new URL(`../sources/${name}`, import.meta.url), "utf8"));
const manifest = readJson("manifest.json");
const receipt = readJson("retrieval.json");
const lore = readJson("lore-passages.json");

describe("committed source provenance, not stellar accuracy evidence", () => {
  it("binds every selected source to fetched resources and licence decisions", () => {
    expect(manifest.schema).toBe("fixedstars-sources/1");
    expect(receipt.schema).toBe("fixedstars-source-retrieval/1");
    const sourceIds = manifest.sources.map(({ id }) => id);
    const resourceIds = manifest.resources.map(({ id }) => id);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
    expect(new Set(resourceIds).size).toBe(resourceIds.length);
    expect(receipt.resources.map(({ id }) => id)).toEqual(resourceIds);
    for (const resource of manifest.resources) {
      expect(resource.url).toMatch(/^https:\/\//u);
      expect(resource.sha256).toMatch(/^[0-9a-f]{64}$/u);
      const observed = receipt.resources.find(({ id }) => id === resource.id);
      expect(observed.sha256).toBe(resource.sha256);
      expect(observed.bytes).toBeGreaterThan(0);
      expect(observed.bytes).toBeLessThanOrEqual(resource.maximumBytes);
      if (resource.csvHeader) expect(observed.csvHeader).toBe(resource.csvHeader);
    }
    for (const source of manifest.sources) {
      expect(source.retrievedOn).toBe(manifest.retrievedOn);
      for (const field of ["title", "author", "url", "locator", "license", "attribution"]) {
        expect(source[field].trim().length).toBeGreaterThan(0);
      }
      for (const id of source.resourceIds) expect(resourceIds).toContain(id);
    }
    const astrometry = manifest.sources.find(({ role }) => role === "astrometry");
    expect(astrometry.license).toBe("CC-BY-SA-4.0");
    expect(astrometry.licenseUrl).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(astrometry.licenseEvidenceResourceIds).toContain("hyg-license");
    for (const id of astrometry.licenseEvidenceResourceIds) expect(astrometry.resourceIds).toContain(id);
  });

  it("records the source-frame inference separately from the engine target frame", () => {
    const contract = manifest.astrometryImport;
    expect(contract.sourceDeclaredEpochJulianYear).toBe(2000);
    expect(contract.sourceFrameInterpretation).toBe("icrs");
    expect(contract.sourceFrameBasis).toBe("documented-inference");
    expect(contract.catalogFrame).toBe("j2000-mean-equator-equinox");
    expect(contract.frameDerivation).toContain('transpose(frameMatrix("equatorial-icrs", time))');
    expect(contract.frameDerivation).toContain("proper-motion tangent");
    expect(contract.frameCaveat).toContain("no homogeneous reduction or precision guarantee");
    expect(contract.raSourceUnit).toBe("hours");
    expect(contract.raDegreesPerHour).toBe(15);
    expect(contract.raMotionConvention).toBe("mu_alpha_star=(dRA/dt)*cos(dec)");
    expect(contract.julianYearDays).toBe(365.25);
    expect(contract.missingMotion).toContain("do not coerce blanks to zero");
    expect(manifest.sources.some(({ id }) => id === contract.frameReferenceSourceId)).toBe(true);
    expect(contract.rowProvenanceRequirements).toContain("raw-selected-row");
    expect(manifest.leads.every(({ status }) => status === "not-imported")).toBe(true);
  });

  it("keeps printed lore locators, identification scope, and graded language", () => {
    expect(lore.schema).toBe("fixedstars-lore-passages/1");
    expect(new Set(lore.passages.map(({ id }) => id)).size).toBe(lore.passages.length);
    for (const passage of lore.passages) {
      expect(passage.status).toBe("historical-attribution");
      const source = manifest.sources.find(({ id }) => id === passage.sourceId);
      expect(source.role).toBe("historical-text");
      expect(source.license).toBe("public-domain-original-text-US");
      expect(passage.locator).toContain(`printed p. ${passage.printedPage}`);
      expect(passage.locator).toContain(`PDF page ${passage.pdfPage}`);
      expect(["named-star", "constellation", "described-group"]).toContain(passage.scope);
      expect(passage.excerptBasis).toBe("own-transcription-checked-against-page-image");
      expect(passage.excerpt.trim().split(/\s+/u).length).toBeLessThanOrEqual(40);
      expect(passage.excerpt.trim().length).toBeGreaterThan(0);
    }
    const spica = lore.passages.find(({ id }) => id === "ptolemy-spica");
    expect(spica.interpretation).toEqual({ primary: "Venus", secondary: "partly Mars" });
    expect(spica.printedPage).toBe(26);
    const lyra = lore.passages.find(({ id }) => id === "ptolemy-lyra");
    expect(lyra.scope).toBe("constellation");
    expect(lyra.subject).toBe("Lyra");
  });
});

// Invented UTF-8 source content. The reference is Node's independent SHA-256
// over the entire byte string, never saved output from auditResource.
function fixture(text = '"id","ra"\n1,0\n') {
  const bytes = Buffer.from(text);
  const resource = {
    id: "synthetic-source",
    url: "https://example.invalid/synthetic.csv",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    maximumBytes: bytes.byteLength,
    csvHeader: '"id","ra"'
  };
  const fakeFetch = async () => new Response(new ReadableStream({
    start(controller) {
      // Fragment the header and record across separate stream chunks.
      for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.subarray(i, i + 3));
      controller.close();
    }
  }));
  return { resource, fakeFetch, bytes };
}

describe("source retrieval fails closed without saving remote files", () => {
  it("hashes a fragmented stream and returns a small metadata receipt", async () => {
    const { resource, fakeFetch, bytes } = fixture();
    expect(await auditResource(resource, fakeFetch)).toEqual({
      id: resource.id, sha256: resource.sha256, bytes: bytes.length, csvHeader: resource.csvHeader
    });
  });

  it("rejects changed content even when its CSV header still matches", async () => {
    const { resource } = fixture();
    const changed = fixture('"id","ra"\n1,1\n');
    await expect(auditResource(resource, changed.fakeFetch)).rejects.toThrow("source digest changed");
  });

  it("rejects an unexpected header even when the content digest matches", async () => {
    const { resource, fakeFetch } = fixture();
    await expect(auditResource({ ...resource, csvHeader: '"id","dec"' }, fakeFetch)).rejects.toThrow("source header changed");
  });

  it("stops at the resource download budget", async () => {
    const { resource, fakeFetch } = fixture();
    await expect(auditResource({ ...resource, maximumBytes: 5 }, fakeFetch)).rejects.toThrow("source exceeds download budget");
  });

  it("rejects unbounded or unterminated headers", async () => {
    const long = fixture("x".repeat(16_385));
    await expect(auditResource(long.resource, long.fakeFetch)).rejects.toThrow("source header exceeds budget");
    const short = fixture('"id","ra"');
    await expect(auditResource(short.resource, short.fakeFetch)).rejects.toThrow("source has no header terminator");
  });

  it("rejects HTTP failures and propagates stream failures", async () => {
    const { resource } = fixture();
    await expect(auditResource(resource, async () => new Response("", { status: 404 }))).rejects.toThrow("source unavailable");
    const failure = new Error("synthetic interrupted download");
    const interrupted = async () => new Response(new ReadableStream({
      start(controller) { controller.error(failure); }
    }));
    await expect(auditResource(resource, interrupted)).rejects.toBe(failure);
  });
});
