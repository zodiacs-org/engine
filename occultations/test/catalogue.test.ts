import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import acquisition from "../data/sao-acquisition.json" with { type: "json" };
import aliases from "../data/sao-aliases.json" with { type: "json" };
import rawSource from "../data/sao-source.json" with { type: "json" };
import { starCatalogue } from "../src/catalogue.js";
import {
  CATALOGUE_SELECTION, extractSaoSource, j2000EclipticLatitude,
  parseSaoRecord, parseSaoResponse, selected, validateSaoSource
} from "../src/catalogue-source.js";
import type { SaoSource } from "../src/catalogue-source.js";

// These are source-transcription, unit-conversion and geometric tests.
// Catalogue values and the package's output are not independent sky accuracy evidence.
const SOURCE = rawSource as SaoSource;
const SOURCE_FILE_SHA256 = "d63beb48d1ed66e3ac0a8d245ce7670a072321351405cf8a0d6a81889f968e47";
const SOURCE_CANONICAL_SHA256 = "492223283ccaf839ca21bc97e1f137e17994fb7e47db4fe743283f4bdd395ccd";
const DOCUMENTATION_SHA256 = "711a4145bbe683e33e9999d7cad30b057d5488a97afccb42eb70591abb77a5ad";
const REQUIRED = [
  [76126, "Celaeno"], [76131, "Electra"], [76140, "Taygeta"], [76155, "Maia"],
  [76159, "Asterope"], [76164, "22 Tauri"], [76172, "Merope"], [76199, "Alcyone"],
  [76228, "Atlas"], [76229, "Pleione"], [94027, "Aldebaran"], [98967, "Regulus"],
  [157923, "Spica"], [184415, "Antares"]
] as const;

function row(overrides: Readonly<Record<number, string>> = {}): string {
  const cells = ["SAO 100", "0", "0", "4.5", "0.1", "-0.2", "15", "0", "74", "1"];
  for (const [index, value] of Object.entries(overrides)) cells[Number(index)] = value;
  return cells.join("|");
}

function response(rows: readonly string[]): string {
  return `${acquisition.columns.join("|")}\n${rows.join("\n")}\n\nNumber of rows: ${rows.length}\nNumber of columns: 10\n\n`;
}

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("SAO source parsing, not stellar accuracy", () => {
  it("transcribes a published source row including scientific notation without changing units", () => {
    // HEASARC SAO query in sao-acquisition.json, row SAO 76126 (Celaeno).
    // FK5 motion units: NASA ADC documentation, Table 1, printed page 2-4.
    const source = SOURCE.rows.find((line) => line.startsWith("SAO 76126 "))!;
    expect(parseSaoRecord(source)).toEqual({
      sao: 76126, raDegrees: 56.2007125, decDegrees: 24.28946944, visualMagnitude: 5.4,
      raSecondsOfTimePerYear: 0.0008, decArcsecondsPerYear: -0.046,
      magnitudeSourceCode: 14, duplicityVariabilityCode: 0,
      sourceCatalogueCode: 70, properMotionSourceCode: 1
    });
  });

  it("accepts signed decimal and scientific numbers but preserves zero as a measurement", () => {
    const actual = parseSaoRecord(row({ 1: " 1.2E+2 ", 2: " -.5e1 ", 4: "0.0", 5: "+0e-3" }));
    expect(actual.raDegrees).toBe(120);
    expect(actual.decDegrees).toBe(-5);
    expect(actual.raSecondsOfTimePerYear).toBe(0);
    expect(actual.decArcsecondsPerYear).toBe(0);
  });

  it("preserves missing motion and missing metadata as null", () => {
    expect(parseSaoRecord(row({ 4: "", 5: " ", 6: "", 7: "", 8: "", 9: "" }))).toMatchObject({
      raSecondsOfTimePerYear: null, decArcsecondsPerYear: null,
      magnitudeSourceCode: null, duplicityVariabilityCode: null,
      sourceCatalogueCode: null, properMotionSourceCode: null
    });
  });

  it.each(["", "99.9", "9.99E1"])("treats magnitude %j as unavailable, not faint numerical data", (value) => {
    const parsed = parseSaoRecord(row({ 3: value }));
    expect(parsed.visualMagnitude).toBeNull();
    expect(selected(parsed)).toBe(false);
  });

  it.each([
    { 0: "SAO 0" }, { 0: "SAO 258998" }, { 0: "SAO 00100" }, { 0: "HR 100" },
    { 0: "SAO 1e2" }, { 1: "" }, { 2: "" }, { 1: "360" }, { 1: "-0.001" },
    { 1: "360.001" }, { 2: "90.001" }, { 2: "-90.001" }, { 3: "100" },
    { 3: "NaN" }, { 3: "Infinity" }, { 4: "0x10" }, { 4: "1e999" }, { 4: "1,5" },
    { 4: "null" }, { 4: "--1" }, { 4: "100.001" }, { 5: "-100.001" },
    { 6: "1.5" }, { 6: "4" }, { 6: "25" }, { 7: "8" }, { 8: "19" }, { 8: "100" },
    { 9: "2" }, { 9: "10" }
  ])("rejects malformed or out-of-range source fields %#", (fields) => {
    expect(() => parseSaoRecord(row(fields))).toThrow();
  });

  it("requires exactly the pinned field layout and allows celestial poles", () => {
    expect(() => parseSaoRecord(`${row()}|unexpected`)).toThrow(/column count/);
    expect(() => parseSaoRecord(row().split("|").slice(0, -1).join("|"))).toThrow(/column count/);
    expect(parseSaoRecord(row({ 1: "0", 2: "-90" })).decDegrees).toBe(-90);
    expect(parseSaoRecord(row({ 1: "359.999", 2: "90" })).decDegrees).toBe(90);
  });

  it("requires a completed response and preserves its exact source lines", () => {
    const rows = [row(), row({ 0: "SAO 101", 4: " 8.0E-4 " })];
    expect(parseSaoResponse(response(rows))).toEqual(rows);
  });

  it("refuses changed headers, duplicate IDs, footer count changes, and incomplete downloads", () => {
    const text = response([row()]);
    expect(() => parseSaoResponse(text.replace("proper_motion_ra_fk5", "proper_motion_ra"))).toThrow(/columns/);
    expect(() => parseSaoResponse(response([row(), row({ 1: "1" })]))).toThrow(/Duplicate/);
    expect(() => parseSaoResponse(text.replace("Number of rows: 1", "Number of rows: 2"))).toThrow(/footer/);
    expect(() => parseSaoResponse(text.replace("Number of columns: 10", "Number of columns: 9"))).toThrow(/footer/);
    expect(() => parseSaoResponse(text.slice(0, text.indexOf("\n\n")))).toThrow(/footer/);
    expect(() => parseSaoResponse(text.slice(0, -1))).toThrow(/footer/);
    expect(() => parseSaoResponse(`${text}<html>error</html>`)).toThrow(/footer/);
    expect(() => parseSaoResponse(text.replaceAll("\n", "\r\n"))).toThrow(/line endings/);
    expect(() => parseSaoResponse("<html>Service unavailable</html>")).toThrow(/columns/);
    expect(() => parseSaoResponse("x".repeat(2_000_000))).toThrow(/size/);
  });

  it("checks parent bytes before interpreting a plausible response", () => {
    expect(() => extractSaoSource(Buffer.from(response([row()])))).toThrow(/digest mismatch/);
    expect(() => extractSaoSource(new Uint8Array(acquisition.bytes))).toThrow(/digest mismatch/);
  });
});

describe("catalogue selection geometry and frozen input", () => {
  it("pins source extract and unchanged original documentation bytes", () => {
    expect(digest(readFileSync(new URL("../data/sao-source.json", import.meta.url)))).toBe(SOURCE_FILE_SHA256);
    expect(digest(JSON.stringify(SOURCE))).toBe(SOURCE_CANONICAL_SHA256);
    expect(digest(readFileSync(new URL("../data/sao-documentation.txt", import.meta.url)))).toBe(DOCUMENTATION_SHA256);
  });

  it("straddles both latitude boundaries using elementary J2000 plane geometry", () => {
    // IAU 2006 J2000 mean obliquity, 84381.406 arcseconds. At RA=0,
    // sin(beta)=sin(dec)*cos(obliquity), so the boundary follows by inversion.
    // This evaluates a single fixed plane; no precession algorithm is duplicated.
    const radians = Math.PI / 180;
    const obliquity = (84381.406 / 3600) * radians;
    const boundaryDec = Math.asin(Math.sin(8 * radians) / Math.cos(obliquity)) / radians;
    expect(j2000EclipticLatitude({ raDegrees: 0, decDegrees: 0 })).toBeCloseTo(0, 12);
    for (const sign of [-1, 1]) {
      const inside = parseSaoRecord(row({ 2: String(sign * (boundaryDec - 0.00001)) }));
      const outside = parseSaoRecord(row({ 2: String(sign * (boundaryDec + 0.00001)) }));
      expect(Math.abs(j2000EclipticLatitude(inside))).toBeLessThan(8);
      expect(Math.abs(j2000EclipticLatitude(outside))).toBeGreaterThan(8);
      expect(selected(inside)).toBe(true);
      expect(selected(outside)).toBe(false);
    }
  });

  it("applies the magnitude cutoff, explicit inclusions, and third-party exclusions in that order", () => {
    expect(selected(parseSaoRecord(row({ 3: "4.5" })))).toBe(true);
    expect(selected(parseSaoRecord(row({ 3: "4.50001" })))).toBe(false);
    expect(selected(parseSaoRecord(row({ 0: "SAO 76164", 2: "80", 3: "99.9" })))).toBe(true);
    for (const sao of [84129, 92548]) {
      expect(selected(parseSaoRecord(row({ 0: `SAO ${sao}`, 3: "1" })))).toBe(false);
    }
  });

  it("retains the complete frozen subset in stable numeric order with all curated targets", () => {
    const records = validateSaoSource(SOURCE);
    const ids = records.map((record) => record.sao);
    expect(records).toHaveLength(119);
    expect(new Set(ids).size).toBe(119);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(CATALOGUE_SELECTION.requiredSao).toEqual(REQUIRED.map(([sao]) => sao));
    expect(aliases.entries).toHaveLength(14);
    expect(aliases.entries.filter((entry) => entry.group === "pleiades")).toHaveLength(10);
    const requiredIds = new Set<number>(REQUIRED.map(([sao]) => sao));
    for (const record of records) {
      expect([84129, 92548]).not.toContain(record.sao);
      if (!requiredIds.has(record.sao)) {
        expect(record.visualMagnitude).not.toBeNull();
        expect(record.visualMagnitude!).toBeLessThanOrEqual(4.5);
        expect(Math.abs(j2000EclipticLatitude(record))).toBeLessThanOrEqual(8);
      }
    }
    for (const [sao, label] of REQUIRED) expect(aliases.entries.find((entry) => entry.sao === sao)?.label).toBe(label);
  });

  it("refuses subset edits that change policy, membership, order, uniqueness or required coverage", () => {
    expect(() => validateSaoSource({ ...SOURCE, schema: "wrong" } as unknown as SaoSource)).toThrow(/schema/);
    expect(() => validateSaoSource({ ...SOURCE, selection: { ...SOURCE.selection, maximumVisualMagnitude: 5 } } as unknown as SaoSource)).toThrow(/policy/);
    expect(() => validateSaoSource({ ...SOURCE, rows: [...SOURCE.rows].reverse() })).toThrow(/order/);
    expect(() => validateSaoSource({ ...SOURCE, rows: [...SOURCE.rows, SOURCE.rows[0]!] })).toThrow(/Duplicate/);
    expect(() => validateSaoSource({ ...SOURCE, rows: SOURCE.rows.filter((line) => parseSaoRecord(line).sao !== 76164) })).toThrow(/required/);
    expect(() => validateSaoSource({ ...SOURCE, rows: [row({ 0: "SAO 1", 2: "80" }), ...SOURCE.rows] })).toThrow(/membership/);
  });
});

describe("offline catalogue normalization and receipts", () => {
  it("retains named identities and distinguishes the two Sterope targets", () => {
    const { stars } = starCatalogue();
    for (const [sao, label] of REQUIRED) {
      expect(stars.find((star) => star.sao === sao)).toMatchObject({
        id: `sao:${sao}`, label, selection: "named-inclusion",
        aliasSourceUrl: aliases.entries.find((entry) => entry.sao === sao)!.sourceUrl
      });
    }
    const asterope = stars.find((star) => star.sao === 76159)!;
    const other = stars.find((star) => star.sao === 76164)!;
    expect(asterope.aliases).toEqual(expect.arrayContaining(["Asterope", "21 Tauri", "21 Tau"]));
    expect(other.aliases).toEqual(expect.arrayContaining(["22 Tauri", "22 Tau"]));
    expect(other.aliases).not.toContain("Asterope");
    expect(stars.filter((star) => star.group === "pleiades")).toHaveLength(10);
  });

  it("normalizes published motion fields and reports historical magnitude and multiplicity semantics", () => {
    const { stars } = starCatalogue();
    const regulus = stars.find((star) => star.sao === 98967)!;
    const celaeno = stars.find((star) => star.sao === 76126)!;
    const antares = stars.find((star) => star.sao === 184415)!;
    const variable = stars.find((star) => star.sao === 79031)!;
    expect(regulus.properMotion.decMasPerYear).toBe(8);
    expect(celaeno.properMotion.decMasPerYear).toBe(-46);
    // cos(24.28946944 degrees) is between 0.91 and 0.92, independently of any ephemeris.
    // A raw 0.0008 seconds of time/year is 12 mas/year before that projection.
    expect(celaeno.properMotion.raCosDecMasPerYear!).toBeGreaterThan(12 * 0.91);
    expect(celaeno.properMotion.raCosDecMasPerYear!).toBeLessThan(12 * 0.92);
    expect(regulus).toMatchObject({ frame: "FK5-J2000", epochJulianYear: 2000, multiplicity: "unknown", variability: "unknown" });
    expect(regulus.limitations).toContain("multiplicity-unknown");
    expect(antares.multiplicity).toBe("flagged-double");
    expect(antares.magnitude).toEqual({ value: 1.1, band: "SAO-heterogeneous-visual", sourceCode: 16 });
    expect(antares.limitations).toContain("combined-magnitude");
    expect(variable.variability).toBe("flagged-variable");
    expect(variable.properMotion.decMasPerYear).toBe(0);
    for (const star of stars) {
      expect(star.parallaxMas).toBeNull();
      expect(star.radialVelocityKmPerSecond).toBeNull();
    }
  });

  it("converts an analytic motion fixture and preserves unknowns through the public runtime path", async () => {
    // Substitute only the frozen source module; retain every required identifier so
    // ordinary validation and normalization run. The fixture is synthetic, not sky data.
    const rows = REQUIRED.map(([sao], index) => row({
      0: `SAO ${sao}`, 2: "60", 4: index === 1 || index === 5 ? "" : index === 2 ? "0" : "0.1",
      5: index === 1 || index === 6 ? "" : index === 2 ? "0" : "-0.2",
      6: index === 3 ? "16" : index === 4 ? "17" : "15",
      7: String(index % 8)
    }));
    vi.resetModules();
    vi.doMock("../data/sao-source.json", () => ({ default: { ...SOURCE, rows } }));
    try {
      const synthetic = (await import("../src/catalogue.js")).starCatalogue();
      // cos(60 degrees)=1/2 exactly: 0.1 s_time/year *15 arcsec/s_time *1000/2.
      expect(synthetic.stars[0]!.properMotion.raCosDecMasPerYear).toBeCloseTo(750, 10);
      expect(synthetic.stars[0]!.properMotion.decMasPerYear).toBe(-200);
      expect(synthetic.stars[1]!.properMotion).toEqual({ raCosDecMasPerYear: null, decMasPerYear: null });
      expect(synthetic.stars[1]!.limitations).toContain("proper-motion-incomplete");
      expect(synthetic.stars[2]!.properMotion).toEqual({ raCosDecMasPerYear: 0, decMasPerYear: 0 });
      expect(synthetic.stars[2]!.limitations).not.toContain("proper-motion-incomplete");
      expect(synthetic.stars[3]!.limitations).toContain("combined-magnitude");
      expect(synthetic.stars[4]!.variability).toBe("flagged-variable");
      expect(synthetic.stars[5]!.properMotion).toEqual({ raCosDecMasPerYear: null, decMasPerYear: -200 });
      expect(synthetic.stars[5]!.limitations).toContain("proper-motion-incomplete");
      expect(synthetic.stars[6]!.properMotion.raCosDecMasPerYear).toBeCloseTo(750, 10);
      expect(synthetic.stars[6]!.properMotion.decMasPerYear).toBeNull();
      expect(synthetic.stars[6]!.limitations).toContain("proper-motion-incomplete");
      expect(synthetic.stars.slice(0, 8).map((star) => star.multiplicity)).toEqual([
        "unknown", "flagged-double", "flagged-double", "flagged-double",
        "unknown", "unknown", "unknown", "flagged-double"
      ]);
      expect(synthetic.stars.slice(0, 8).map((star) => star.variability)).toEqual([
        "unknown", "unknown", "unknown", "unknown",
        "flagged-variable", "flagged-variable", "flagged-variable", "flagged-variable"
      ]);
    } finally {
      vi.doUnmock("../data/sao-source.json");
      vi.resetModules();
    }
  });

  it("receipts identify exact source rows and conventions without claiming contact accuracy", () => {
    const catalogue = starCatalogue();
    expect(catalogue.receipt.sourceQuerySha256).toBe(acquisition.sha256);
    expect(catalogue.receipt.sourceQueryUrl).toBe(acquisition.url);
    expect(catalogue.receipt.sourceRetrievedAt).toBe(acquisition.retrievedAt);
    expect(catalogue.receipt.sourceDescriptionUrl).toBe(acquisition.descriptionUrl);
    expect(catalogue.receipt.subsetCanonicalJsonSha256).toBe(SOURCE_CANONICAL_SHA256);
    expect(catalogue.receipt.aliasesCanonicalJsonSha256).toBe(digest(JSON.stringify(aliases)));
    expect(catalogue.receipt.validation).toBe("source-transcription;contact-accuracy-unmeasured");
    expect(catalogue.receipt.conventions).toContain("pmra-source:seconds-of-time-per-year;unweighted");
    expect(catalogue.receipt.conventions).toContain("selection:fixed-J2000-prefilter;not-window-completeness");
    catalogue.stars.forEach((star, index) => {
      expect(star.sourceRowSha256).toBe(digest(SOURCE.rows[index]!));
      expect(Object.isFrozen(star)).toBe(true);
      expect(Object.isFrozen(star.properMotion)).toBe(true);
      expect(Object.isFrozen(star.aliases)).toBe(true);
    });
    expect(Object.isFrozen(catalogue.receipt.selection.requiredSao)).toBe(true);
    expect(JSON.parse(JSON.stringify(catalogue))).toEqual(catalogue);
  });
});
