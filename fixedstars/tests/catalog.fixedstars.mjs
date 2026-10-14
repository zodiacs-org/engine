import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalog, findStar } from "../src/index.ts";
import { convertIcrsAstrometry, rotateAstrometry } from "../src/catalog-import.ts";
import { buildCatalog, catalogModule } from "../scripts/build-catalog.mjs";
import { parseCsvLine, selectHyg } from "../scripts/select-hyg.mjs";

const readJson = (name) => JSON.parse(readFileSync(new URL(`../sources/${name}`, import.meta.url), "utf8"));
const manifest = readJson("manifest.json");
const raw = readJson("hyg-selected.json");
const selection = readJson("selection.json");
const lore = readJson("lore-passages.json");
const contract = manifest.astrometryImport;
const rebuild = (rows = raw, choices = selection) => buildCatalog(rows, choices, lore, contract, convertIcrsAstrometry);
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe("small licensed catalog and traceable generation", () => {
  it("keeps the explicit named-star selection and unit ranges", () => {
    expect(catalog).toHaveLength(44);
    expect(catalog.length).toBeGreaterThanOrEqual(30);
    expect(catalog.length).toBeLessThanOrEqual(100);
    expect(catalog.map(({ id }) => id)).toEqual(selection.stars.map(({ id }) => id));
    expect(new Set(catalog.map(({ id }) => id)).size).toBe(catalog.length);
    for (const star of catalog) {
      expect(star.raDeg).toBeGreaterThanOrEqual(0);
      expect(star.raDeg).toBeLessThan(360);
      expect(Math.abs(star.decDeg)).toBeLessThan(90);
      expect(Number.isFinite(star.raDeg) && Number.isFinite(star.decDeg)).toBe(true);
      expect(star.frame).toBe("j2000-mean-equator-equinox");
      expect(star.epochJulianYear).toBe(2000);
      expect(star.astrometrySourceId).toBe("hyg-v41");
      expect(star.provenance.sourceFrameInterpretation).toBe("icrs");
      expect(star.provenance.sourceFrameBasis).toBe("documented-inference");
      expect(star.provenance.frameDerivation).toBe(contract.frameDerivation);
      expect(star.provenance.rawRowFile).toBe("sources/hyg-selected.json");
      expect(star.provenance.locator).toContain(`id=${star.provenance.hygId}`);
      expect(star.provenance.locator).toContain(`HIP ${star.provenance.hipId}`);
      const saved = raw.rows.find(({ hip }) => hip === star.provenance.hipId);
      expect(saved.id).toBe(star.provenance.hygId);
      if (star.properMotion !== null) {
        expect(Number.isFinite(star.properMotion.raCosDecMasPerYear)).toBe(true);
        expect(Number.isFinite(star.properMotion.decMasPerYear)).toBe(true);
        expect(star.properMotion.sourceId).toBe("hyg-v41");
      }
    }
  });

  it("regenerates byte-for-byte from raw HYG rows, not accuracy reference values", () => {
    const resource = manifest.resources.find(({ id }) => id === "hyg-v41-csv");
    expect(raw.sourceSha256).toBe(resource.sha256);
    expect(raw.header).toBe(resource.csvHeader);
    expect(raw.license).toBe("CC-BY-SA-4.0");
    expect(selection.license).toBe("CC-BY-SA-4.0");
    expect(rebuild()).toEqual(catalog);
    expect(catalogModule(rebuild())).toBe(readFileSync(new URL("../src/catalog-data.ts", import.meta.url), "utf8"));
  });

  it("preserves scope and graded tags without transferring one Gemini clause to the other", () => {
    for (const star of catalog) for (const attribution of star.historicalAttributions) {
      const passage = lore.passages.find(({ id }) => id === attribution.passageId);
      expect(passage).toBeDefined();
      for (const field of ["status", "sourceId", "author", "work", "locator", "scope", "subject"]) {
        expect(attribution[field]).toBe(passage[field]);
      }
      expect(attribution.status).toBe("historical-attribution");
      expect(attribution.identification.length).toBeGreaterThan(0);
    }
    expect(findStar("Spica").historicalAttributions[0].tags).toEqual(["Venus", "partly Mars"]);
    expect(findStar("Antares").historicalAttributions[0].tags).toEqual(["Mars", "moderately Jupiter"]);
    expect(findStar("Antares").historicalAttributions[0].scope).toBe("described-group");
    expect(findStar("Castor").historicalAttributions[0].tags).toEqual(["Mercury"]);
    expect(findStar("Pollux").historicalAttributions[0].tags).toEqual(["Mars"]);
    expect(findStar("Vega").historicalAttributions[0].scope).toBe("constellation");
    expect(findStar("Polaris").historicalAttributions[0].tags).toEqual(["Saturn", "in some degree Venus"]);
    expect(findStar("Sirius").historicalAttributions).toEqual([]);
    expect(findStar("Fomalhaut").historicalAttributions).toEqual([]);
    for (const choice of selection.stars.filter(({ passageId }) => !passageId)) expect(choice.loreOmission).toBeTruthy();
  });

  it("looks up ids and source aliases uniquely and keeps nested data immutable", () => {
    const seen = new Map();
    for (const star of catalog) for (const label of [star.id, star.name, ...star.aliases]) {
      const key = label.toLowerCase();
      expect(seen.get(key) ?? star.id).toBe(star.id);
      seen.set(key, star.id);
      expect(findStar(` ${label.toUpperCase()} `)).toBe(star);
    }
    expect(findStar("HIP 21421").id).toBe("aldebaran");
    expect(findStar("Facula").id).toBe("aldebaran");
    expect(findStar("Cor Leonis").id).toBe("regulus");
    expect(findStar("synthetic unknown")).toBeUndefined();
    expect(() => findStar(" ")).toThrow(RangeError);
    expect(() => findStar(null)).toThrow(RangeError);
    expect(() => catalog.push(catalog[0])).toThrow(TypeError);
    expect(() => { catalog[0].raDeg = 0; }).toThrow(TypeError);
    expect(() => findStar("Spica").historicalAttributions[0].tags.push("synthetic")).toThrow(TypeError);
    expect(() => { catalog[0].provenance.hipId = "0"; }).toThrow(TypeError);
  });
});

function changedRaw(field, value) {
  const copy = structuredClone(raw);
  const keys = parseCsvLine(copy.header);
  const row = parseCsvLine(copy.rows[0].line);
  row[keys.indexOf(field)] = value;
  copy.rows[0].line = row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",");
  return copy;
}

describe("catalog importer refuses invalid or misleading source fields", () => {
  it.each(["", "NaN", "Infinity", "0x10", "12 hours"])("refuses malformed RA %s", (value) => {
    expect(() => rebuild(changedRaw("ra", value))).toThrow();
  });
  it.each([["ra", "24"], ["ra", "-1"], ["dec", "90"], ["dec", "-91"], ["pmra", "bad"]])("refuses %s=%s", (field, value) => {
    expect(() => rebuild(changedRaw(field, value))).toThrow();
  });
  it("distinguishes explicit zero motion from unavailable components", () => {
    let copy = changedRaw("pmra", "0");
    const keys = parseCsvLine(copy.header);
    let row = parseCsvLine(copy.rows[0].line);
    row[keys.indexOf("pmdec")] = "0";
    copy.rows[0].line = row.join(",");
    const zero = rebuild(copy)[0].properMotion;
    expect(zero.raCosDecMasPerYear).toBe(0);
    expect(zero.decMasPerYear).toBe(0);
    expect(rebuild(changedRaw("pmra", ""))[0].properMotion).toBeNull();
    expect(rebuild(changedRaw("pmdec", ""))[0].properMotion).toBeNull();
    row[keys.indexOf("pmra")] = "bad";
    row[keys.indexOf("pmdec")] = "";
    copy.rows[0].line = row.join(",");
    expect(() => rebuild(copy)).toThrow("invalid HYG pmra");
  });
  it.each([["proper", "wrong name"], ["hip", "0"], ["con", "wrong"], ["mag", "3.5"]])("rejects selection mismatch %s", (field, value) => {
    expect(() => rebuild(changedRaw(field, value))).toThrow();
  });
  it("rejects duplicated identifiers, unknown passages and unsupported overrides", () => {
    const duplicate = structuredClone(selection);
    duplicate.stars[1].id = duplicate.stars[0].id;
    expect(() => rebuild(raw, duplicate)).toThrow("duplicate star id");
    const unknown = structuredClone(selection);
    unknown.stars[0].passageId = "missing";
    expect(() => rebuild(raw, unknown)).toThrow("lore passage missing");
    const wrongOverride = structuredClone(selection);
    wrongOverride.stars[0].interpretation = { primary: "Mars", secondary: null };
    expect(() => rebuild(raw, wrongOverride)).toThrow("unsupported lore interpretation override");
    const duplicateRaw = structuredClone(raw);
    duplicateRaw.rows[1] = duplicateRaw.rows[0];
    expect(() => rebuild(duplicateRaw)).toThrow("duplicate raw HIP id");
  });
});

describe("hand-derived motion-tangent and bias geometry; see GEOMETRY.md", () => {
  it("converts source hours into degrees without an additional epoch shift", () => {
    const found = rotateAstrometry({ raHours: 5, decDeg: 60, motion: { raCosDec: 10, dec: -20 } }, identity);
    expect(found.raDeg).toBeCloseTo(75, 12);
    expect(found.decDeg).toBeCloseTo(60, 12);
    expect(found.motion.raCosDec).toBeCloseTo(10, 12);
    expect(found.motion.dec).toBeCloseTo(-20, 12);
  });
  it("preserves tangential components under a quarter-turn around the pole", () => {
    const found = rotateAstrometry({ raHours: 5, decDeg: 60, motion: { raCosDec: 10, dec: -20 } }, [0, -1, 0, 1, 0, 0, 0, 0, 1]);
    expect(found.raDeg).toBeCloseTo(165, 12);
    expect(found.decDeg).toBeCloseTo(60, 12);
    expect(found.motion.raCosDec).toBeCloseTo(10, 12);
    expect(found.motion.dec).toBeCloseTo(-20, 12);
  });
  it("reprojects east into north and north into negative east around the x axis", () => {
    const found = rotateAstrometry({ raHours: 0, decDeg: 0, motion: { raCosDec: 3, dec: 4 } }, [1, 0, 0, 0, 0, -1, 0, 1, 0]);
    expect(found.raDeg).toBe(0);
    expect(found.decDeg).toBe(0);
    expect(found.motion.raCosDec).toBe(-4);
    expect(found.motion.dec).toBe(3);
    expect(Math.hypot(found.motion.raCosDec, found.motion.dec)).toBe(5);
  });
  it("uses the engine bias in the ICRS-to-J2000 direction", () => {
    const found = convertIcrsAstrometry({ raHours: 0, decDeg: 0, motion: { raCosDec: 3, dec: 4 } });
    const eps = 84381.448 / 3600 * Math.PI / 180;
    const c = 0.0068192 / 3600 * Math.PI / 180;
    // First-order expansion of published IERS bias offsets, not stored outputs.
    expect(found.raDeg).toBeCloseTo(0.0146 / 3600, 10);
    expect(found.decDeg).toBeCloseTo(-0.041775 * Math.sin(eps) / 3600, 10);
    expect(found.motion.raCosDec).toBeCloseTo(3 + 4 * c, 10);
    expect(found.motion.dec).toBeCloseTo(4 - 3 * c, 10);
  });
  it("preserves missing motion and refuses nonfinite inputs", () => {
    expect(convertIcrsAstrometry({ raHours: 0, decDeg: 0, motion: null }).motion).toBeNull();
    expect(() => rotateAstrometry({ raHours: 0, decDeg: 0, motion: { raCosDec: NaN, dec: 0 } }, identity)).toThrow(RangeError);
  });
});

function streamFixture(text = '"id","hip","proper"\n1,11,"Synthetic, star"\n2,22,Other\n') {
  const bytes = Buffer.from(text);
  const resource = {
    url: "https://example.invalid/synthetic.csv", csvHeader: '"id","hip","proper"',
    maximumBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex")
  };
  const fakeFetch = async () => new Response(new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 2) controller.enqueue(bytes.subarray(i, i + 2));
      controller.close();
    }
  }));
  return { resource, fakeFetch };
}

describe("streamed raw-row selection, independent synthetic input bytes", () => {
  it("parses quoted commas, escaped quotes and final empty cells", () => {
    expect(parseCsvLine('a,"b,c","say ""yes""",')).toEqual(["a", "b,c", 'say "yes"', ""]);
    for (const invalid of ['"open', '"done"wrong', 'not"quoted', "a\nb"]) expect(() => parseCsvLine(invalid)).toThrow();
  });
  it("retains only requested raw records after digest verification", async () => {
    const { resource, fakeFetch } = streamFixture();
    const found = await selectHyg(resource, [{ hip: "11" }], fakeFetch);
    expect(found.rows).toEqual([{ id: "1", hip: "11", line: '1,11,"Synthetic, star"' }]);
    expect(found.sourceSha256).toBe(resource.sha256);
    expect(found.sourceBytes).toBe(resource.maximumBytes);
    expect(found.license).toBe("CC-BY-SA-4.0");
  });
  it("handles CRLF and final records without newline", async () => {
    const { resource, fakeFetch } = streamFixture('"id","hip","proper"\r\n1,11,Synthetic');
    expect((await selectHyg(resource, [{ hip: "11" }], fakeFetch)).rows[0].line).toBe("1,11,Synthetic");
  });
  it("refuses digest, header and byte-budget changes", async () => {
    const { resource, fakeFetch } = streamFixture();
    await expect(selectHyg({ ...resource, sha256: "0".repeat(64) }, [{ hip: "11" }], fakeFetch)).rejects.toThrow("digest changed");
    await expect(selectHyg({ ...resource, csvHeader: "different" }, [{ hip: "11" }], fakeFetch)).rejects.toThrow("header changed");
    await expect(selectHyg({ ...resource, maximumBytes: 1 }, [{ hip: "11" }], fakeFetch)).rejects.toThrow("download exceeds budget");
  });
  it("refuses missing or duplicate HIP rows, duplicate selections and field-count changes", async () => {
    const { resource, fakeFetch } = streamFixture();
    await expect(selectHyg(resource, [{ hip: "33" }], fakeFetch)).rejects.toThrow("row missing");
    await expect(selectHyg(resource, [{ hip: "11" }, { hip: "11" }], fakeFetch)).rejects.toThrow("duplicate selected HIP");
    const duplicate = streamFixture('"id","hip","proper"\n1,11,One\n2,11,Two\n');
    await expect(selectHyg(duplicate.resource, [{ hip: "11" }], duplicate.fakeFetch)).rejects.toThrow("duplicate HYG HIP");
    const wrong = streamFixture('"id","hip","proper"\n1,11\n');
    await expect(selectHyg(wrong.resource, [{ hip: "11" }], wrong.fakeFetch)).rejects.toThrow("field count changed");
  });
  it("rejects unavailable sources and propagates interrupted streams", async () => {
    const { resource } = streamFixture();
    await expect(selectHyg(resource, [{ hip: "11" }], async () => new Response("", { status: 404 }))).rejects.toThrow("source unavailable");
    const failure = new Error("synthetic stream failure");
    await expect(selectHyg(resource, [{ hip: "11" }], async () => new Response(new ReadableStream({
      start(controller) { controller.error(failure); }
    })))).rejects.toBe(failure);
  });
});
