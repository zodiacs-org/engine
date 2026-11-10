import { createHash } from "node:crypto";
import { eclipticOfDate } from "../../src/frame.js";
import acquisition from "../data/sao-acquisition.json" with { type: "json" };
import aliases from "../data/sao-aliases.json" with { type: "json" };

export const CATALOGUE_SELECTION = Object.freeze({
  id: "sao-bright-lunar/1",
  maximumVisualMagnitude: 4.5,
  maximumAbsoluteJ2000EclipticLatitudeDegrees: 8,
  // The May 1991 appendix identifies these magnitude corrections as SIMBAD data.
  excludedSao: Object.freeze([84129, 92548]),
  requiredSao: Object.freeze(aliases.entries.map((entry) => entry.sao).sort((a, b) => a - b))
});

export interface SaoRecord {
  readonly sao: number;
  readonly raDegrees: number;
  readonly decDegrees: number;
  readonly visualMagnitude: number | null;
  readonly raSecondsOfTimePerYear: number | null;
  readonly decArcsecondsPerYear: number | null;
  readonly magnitudeSourceCode: number | null;
  readonly duplicityVariabilityCode: number | null;
  readonly sourceCatalogueCode: number | null;
  readonly properMotionSourceCode: number | null;
}

export interface SaoSource {
  readonly schema: "zodiacs.occultations.sao-source.v1";
  readonly selection: typeof CATALOGUE_SELECTION;
  /** Exact lines from the response; no rounded or propagated coordinates. */
  readonly rows: readonly string[];
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function number(text: string, label: string, lower: number, upper: number, integer = false): number | null {
  if (text === "") return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/u.test(text)) throw new Error(`Invalid SAO ${label}.`);
  const value = Number(text);
  if (!Number.isFinite(value) || value < lower || value > upper || (integer && !Number.isInteger(value))) {
    throw new Error(`Invalid SAO ${label}.`);
  }
  return value;
}

function code(text: string, label: string, allowed: readonly number[]): number | null {
  const value = number(text, label, 0, 99, true);
  if (value !== null && !allowed.includes(value)) throw new Error(`Unknown SAO ${label} code.`);
  return value;
}

/** Parse only the pinned query's columns, not arbitrary CSV or a TAP error page. */
export function parseSaoRecord(line: string): SaoRecord {
  const cells = line.split("|").map((cell) => cell.trim());
  if (cells.length !== acquisition.columns.length) throw new Error("Invalid SAO column count.");
  const match = /^SAO ([1-9]\d*)$/u.exec(cells[0]!);
  if (!match) throw new Error("Invalid SAO identifier.");
  const sao = number(match[1]!, "identifier", 1, 258997, true)!;
  const raDegrees = number(cells[1]!, "RA", 0, 360);
  const decDegrees = number(cells[2]!, "declination", -90, 90);
  if (raDegrees === null || raDegrees === 360 || decDegrees === null) throw new Error("Missing or invalid SAO position.");
  const magnitude = number(cells[3]!, "magnitude", -10, 99.9);
  return {
    sao, raDegrees, decDegrees,
    visualMagnitude: magnitude === 99.9 ? null : magnitude,
    raSecondsOfTimePerYear: number(cells[4]!, "FK5 RA motion", -100, 100),
    decArcsecondsPerYear: number(cells[5]!, "FK5 declination motion", -100, 100),
    magnitudeSourceCode: code(cells[6]!, "magnitude source", [0, 1, 2, 3, 5, 8, 9, 10, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24]),
    duplicityVariabilityCode: number(cells[7]!, "duplicity/variability", 0, 7, true),
    sourceCatalogueCode: code(cells[8]!, "source catalogue", [1, 2, 3, 4, 5, 6, 20, 21, 22, 23, 24, 25, 26,
      27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 40, 41, 42, 43, 48, 60, 61, 70, 71, 74]),
    properMotionSourceCode: code(cells[9]!, "motion source", [1, 3, 5, 6, 8])
  };
}

/** Loose catalogue prefilter only. No apparent-place or epoch propagation occurs. */
export function j2000EclipticLatitude(record: Pick<SaoRecord, "raDegrees" | "decDegrees">): number {
  const ra = record.raDegrees * Math.PI / 180;
  const dec = record.decDegrees * Math.PI / 180;
  return eclipticOfDate(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec), 0).lat;
}

export function selected(record: SaoRecord): boolean {
  if ((CATALOGUE_SELECTION.excludedSao as readonly number[]).includes(record.sao)) return false;
  return CATALOGUE_SELECTION.requiredSao.includes(record.sao) ||
    (record.visualMagnitude !== null && record.visualMagnitude <= CATALOGUE_SELECTION.maximumVisualMagnitude &&
      Math.abs(j2000EclipticLatitude(record)) <= CATALOGUE_SELECTION.maximumAbsoluteJ2000EclipticLatitudeDegrees);
}

function uniqueRows(rows: readonly string[]): { line: string; record: SaoRecord }[] {
  const seen = new Set<number>();
  return rows.map((line) => {
    const record = parseSaoRecord(line);
    if (seen.has(record.sao)) throw new Error("Duplicate SAO identifier.");
    seen.add(record.sao);
    return { line, record };
  });
}

/** Validate the explicit text/plain table envelope, including its completion footer. */
export function parseSaoResponse(text: string): readonly string[] {
  if (Buffer.byteLength(text) >= 2_000_000 || text.includes("\r")) throw new Error("Invalid SAO response size or line endings.");
  const lines = text.split("\n");
  if (lines.shift()?.split("|").map((cell) => cell.trim()).join(",") !== acquisition.columns.join(",")) {
    throw new Error("Unexpected SAO response columns.");
  }
  const boundary = lines.findIndex((line) => line === "");
  if (boundary < 0) throw new Error("SAO response is missing its completion footer.");
  const rows = lines.slice(0, boundary);
  const footer = lines.slice(boundary).join("\n");
  const match = /^\nNumber of rows:[ \t]+(\d+)\nNumber of columns:[ \t]+(\d+)\n\n$/u.exec(footer);
  if (!match || Number(match[1]) !== rows.length || Number(match[2]) !== acquisition.columns.length) {
    throw new Error("SAO response count or footer mismatch.");
  }
  uniqueRows(rows);
  return rows;
}

/** Reproduce a compact source extract only from the frozen parent query bytes. */
export function extractSaoSource(bytes: Uint8Array): SaoSource {
  if (bytes.length !== acquisition.bytes || sha256(bytes) !== acquisition.sha256) throw new Error("SAO source digest mismatch.");
  const rows = parseSaoResponse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (rows.length !== acquisition.rows) throw new Error("SAO source row count mismatch.");
  const chosen = uniqueRows(rows).filter(({ record }) => selected(record)).sort((a, b) => a.record.sao - b.record.sao);
  for (const sao of CATALOGUE_SELECTION.requiredSao) {
    if (!chosen.some(({ record }) => record.sao === sao)) throw new Error("SAO source omits a required named target.");
  }
  return { schema: "zodiacs.occultations.sao-source.v1", selection: CATALOGUE_SELECTION, rows: chosen.map(({ line }) => line) };
}

/** Offline integrity/selection checks; full parent extraction is a separate check. */
export function validateSaoSource(source: SaoSource): readonly SaoRecord[] {
  if (source.schema !== "zodiacs.occultations.sao-source.v1" || JSON.stringify(source.selection) !== JSON.stringify(CATALOGUE_SELECTION)) {
    throw new Error("Unexpected SAO subset schema or selection policy.");
  }
  const parsed = uniqueRows(source.rows);
  if (parsed.length === 0 || parsed.some(({ record }, index) => !selected(record) ||
      (index > 0 && record.sao <= parsed[index - 1]!.record.sao))) throw new Error("Invalid SAO subset membership or order.");
  for (const sao of CATALOGUE_SELECTION.requiredSao) {
    if (!parsed.some(({ record }) => record.sao === sao)) throw new Error("SAO subset omits a required named target.");
  }
  return parsed.map(({ record }) => record);
}
