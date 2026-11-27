// scripts/minor-bodies/build-pack-data.mjs, which writes src/minor-bodies/pack-data.ts from
// fit.py's fitted-pack.json and fetch-horizons.py's provenance.json. Neither the raw Horizons
// responses (about 20 MB) nor fitted-pack.json is committed (.cache/minor-bodies/), so the
// fitted pack is rebuilt here from what is: the tables and layouts in the committed
// pack-data.ts, and src/minor-bodies/provenance.json, the provenance.json it was written from.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import * as PACK from "../../src/minor-bodies/pack-data.ts";
import { BODIES, PUBLIC_BODY_FIELDS, checkVectors, packDataText } from "./build-pack-data.mjs";

const committed = readFileSync(new URL("../../src/minor-bodies/pack-data.ts", import.meta.url), "utf8");
const provenance = () => JSON.parse(readFileSync(new URL("../../src/minor-bodies/provenance.json", import.meta.url), "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** fitted-pack.json as fit.py writes it for the committed tables, each fitted to the vectors `recorded` names. */
function fittedPack(recorded = provenance()) {
  const tables = BODIES.map((name) => Buffer.from(PACK[`${name.toUpperCase()}_PACK`], "base64"));
  let offset = 0;
  const bodies = Object.fromEntries(
    BODIES.map((name, index) => {
      const { intervals, intervalDays, degree, unitKm, k32, k8Start, maxFitResidualKm } = PACK[`${name.toUpperCase()}_LAYOUT`];
      const body = { offset, bytes: tables[index].length, intervals, intervalDays, degree, unitKm, k32, k8Start, maxFitResidualKm, vectorsSha256: recorded.bodies[name].sha256 };
      offset += body.bytes;
      return [name, body];
    })
  );
  const combined = Buffer.concat(tables);
  const { spanStartJd, spanEndJd } = PACK.CHIRON_LAYOUT;
  return { format: "ZODMB01", spanStartJd, spanEndJd, bodies, totalRawBytes: combined.length, base64: combined.toString("base64") };
}

describe("scripts/minor-bodies/build-pack-data.mjs", () => {
  it("wrote the committed src/minor-bodies/pack-data.ts, byte for byte, from its tables and provenance.json", () => {
    expect(packDataText(provenance(), fittedPack()) === committed).toBe(true);
  });

  it("refuses a fitted pack that does not record the vectors it was fitted to, or records other vectors than provenance.json", () => {
    const unrecorded = fittedPack();
    delete unrecorded.bodies.Ceres.vectorsSha256;
    expect(() => packDataText(provenance(), unrecorded)).toThrow(
      /^Ceres: fitted-pack\.json does not record the SHA-256 of the vectors it was fitted to \(vectorsSha256\)/u
    );
    // A fit left from the earlier vectors beside the provenance.json of a newer fetch.
    const newer = provenance();
    newer.bodies.Juno.sha256 = sha256("a newer Juno response");
    expect(() => packDataText(newer, fittedPack(provenance()))).toThrow(
      new RegExp(`^Juno: fitted-pack\\.json was fitted to other vectors \\(vectorsSha256 ${provenance().bodies.Juno.sha256}\\) than the response provenance\\.json records \\(sha256 ${newer.bodies.Juno.sha256}\\)`, "u")
    );
    const other = fittedPack();
    other.bodies.Vesta.vectorsSha256 = sha256("another Vesta response");
    expect(() => packDataText(provenance(), other)).toThrow(/^Vesta: fitted-pack\.json was fitted to other vectors/u);
  });

  it("writes each body's solution beside its table, from provenance.json", () => {
    for (const name of BODIES) {
      const id = /JPL#\d+/u.exec(provenance().bodies[name].solution)[0];
      expect(committed).toContain(`export const ${name.toUpperCase()}_SOLUTION = ${JSON.stringify(id)};`);
      expect(PACK[`${name.toUpperCase()}_SOLUTION`]).toBe(id);
      expect(PACK.PROVENANCE.bodies[name].solution).toBe(id);
    }
    // A new solution after a fresh fetch reaches the constant and the provenance together.
    const refetched = provenance();
    refetched.bodies.Pallas.solution = "1: soln ref.= JPL#75, OCC=0";
    refetched.bodies.Pallas.target = "2 Pallas (A802 FA)              {source: JPL#75}";
    const text = packDataText(refetched, fittedPack(refetched));
    expect(text).toContain('export const PALLAS_SOLUTION = "JPL#75";');
    expect(text).toMatch(/ Pallas: \/\*#__PURE__\*\/ Object\.freeze\(\{[^}]*\n {6}solution: "JPL#75",\n/u);
    expect(text).not.toContain("JPL#74");
  });

  it("gives the provenance constant each body's documented fields, whatever else provenance.json records for it", () => {
    expect(PUBLIC_BODY_FIELDS).toEqual(["command", "step", "rows", "bytes", "sha256", "solution", "record", "target"]);
    for (const name of BODIES) expect(Object.keys(PACK.PROVENANCE.bodies[name])).toEqual(PUBLIC_BODY_FIELDS);
    // fetch-horizons.py writes the time each response was fetched beside each body; the constant leaves it out.
    const fresh = provenance();
    for (const name of BODIES) fresh.bodies[name] = { ...fresh.bodies[name], fetchedAtUtc: "2026-11-27T03:04:05.678901+00:00" };
    expect(packDataText(fresh, fittedPack(fresh)) === committed).toBe(true);
  });

  it("refuses a raw response that is not the size and SHA-256 provenance.json records", () => {
    const raw = Buffer.from("a synthetic VECTORS response");
    const recorded = { bodies: Object.fromEntries(BODIES.map((name) => [name, { bytes: raw.length, sha256: sha256(raw) }])) };
    expect(() => checkVectors(recorded, () => raw)).not.toThrow();
    const changed = Buffer.from("a synthetic VECTORS responsf");
    expect(() => checkVectors(recorded, (name) => (name === "Juno" ? changed : raw))).toThrow(/^Juno: the raw response's SHA-256 is not the one provenance\.json records/u);
    expect(() => checkVectors(recorded, (name) => (name === "Chiron" ? raw.subarray(1) : raw))).toThrow(/^Chiron: the raw response is not the size provenance\.json records/u);
  });
});
