import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { parseCsvLine, selectHyg } from "./select-hyg.mjs";

const project = new URL("../", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, project), "utf8"));
const stringify = (value) => `${JSON.stringify(value, null, 2)}\n`;

function number(value, name) {
  assert(typeof value === "string" && /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/u.test(value), `invalid HYG ${name}`);
  const found = Number(value);
  assert(Number.isFinite(found), `nonfinite HYG ${name}`);
  return found;
}

/** Validate raw rows before conversion; callers supply the existing engine adapter. */
export function buildCatalog(raw, selection, lore, contract, convert) {
  assert.equal(raw.schema, "fixedstars-hyg-selection/1");
  assert.equal(raw.license, "CC-BY-SA-4.0");
  assert.equal(selection.license, "CC-BY-SA-4.0");
  assert.equal(selection.schema, "fixedstars-catalog-selection/1");
  assert.equal(contract.sourceId, "hyg-v41");
  assert.equal(raw.sourceId, contract.sourceId);
  assert.equal(contract.sourceFrameInterpretation, "icrs");
  assert.equal(contract.sourceFrameBasis, "documented-inference");
  assert.equal(contract.catalogFrame, "j2000-mean-equator-equinox");
  assert.equal(contract.sourceDeclaredEpochJulianYear, 2000);
  assert.equal(contract.raDegreesPerHour, 15);
  assert.equal(contract.raMotionConvention, "mu_alpha_star=(dRA/dt)*cos(dec)");
  assert(selection.stars.length >= 30 && selection.stars.length <= 100, "catalog outside requested size range");
  assert.equal(new Set(selection.stars.map(({ id }) => id)).size, selection.stars.length, "duplicate star id");
  assert.equal(new Set(selection.stars.map(({ hip }) => hip)).size, selection.stars.length, "duplicate selected HIP id");
  assert.equal(raw.rows.length, selection.stars.length, "raw selection count differs");
  assert.equal(new Set(raw.rows.map(({ hip }) => hip)).size, raw.rows.length, "duplicate raw HIP id");
  const header = parseCsvLine(raw.header);
  const stars = selection.stars.map((selected) => {
    assert(/^[a-z][a-z0-9-]*$/u.test(selected.id), "invalid star id");
    const saved = raw.rows.find(({ hip }) => hip === selected.hip);
    assert(saved, "raw selected row missing");
    const fields = parseCsvLine(saved.line);
    assert.equal(fields.length, header.length, "raw field count differs");
    const row = Object.fromEntries(header.map((key, i) => [key, fields[i]]));
    assert.equal(row.id, saved.id, "raw HYG id differs");
    assert.equal(row.hip, saved.hip, "raw HIP id differs");
    assert(/^[1-9]\d*$/u.test(row.id) && /^[1-9]\d*$/u.test(row.hip), "invalid HYG identifiers");
    assert.equal(row.proper, selected.name, "selected proper name differs");
    assert.equal(row.con, selected.constellation, "selected constellation differs");
    assert(number(row.mag, "magnitude") < 3.5, "selected star is outside brightness selection");
    const missingMotion = row.pmra === "" || row.pmdec === "";
    // Validate a present component even when the other component is missing.
    const pmra = row.pmra === "" ? null : number(row.pmra, "pmra");
    const pmdec = row.pmdec === "" ? null : number(row.pmdec, "pmdec");
    const position = convert({
      raHours: number(row.ra, "RA"), decDeg: number(row.dec, "declination"),
      motion: missingMotion ? null : { raCosDec: pmra, dec: pmdec }
    });
    const historicalAttributions = [];
    if (selected.passageId) {
      const passage = lore.passages.find(({ id }) => id === selected.passageId);
      assert(passage, "lore passage missing");
      // The Gemini excerpt has two clauses. Only the following Hercules
      // clause is overridden; never apply Apollo's Mercury to Pollux.
      if (selected.interpretation) {
        assert.equal(selected.id, "pollux", "unsupported lore interpretation override");
        assert.equal(passage.id, "ptolemy-gemini-heads");
        assert.deepEqual(selected.interpretation, { primary: "Mars", secondary: null });
      }
      const interpretation = selected.interpretation ?? passage.interpretation;
      historicalAttributions.push({
        status: passage.status, author: passage.author, work: passage.work,
        locator: passage.locator, sourceId: passage.sourceId, passageId: passage.id,
        scope: passage.scope, subject: passage.subject, identification: selected.identification,
        tags: [interpretation.primary, interpretation.secondary].filter((tag) => tag !== null)
      });
    } else {
      assert(selected.loreOmission, "uncited lore omission");
      assert.equal(selected.historicalAliases.length, 0, "historical alias without citation");
    }
    const aliases = [...new Set([
      row.bf.trim().replace(/\s+/gu, " "), `HIP ${row.hip}`,
      ...(row.hr ? [`HR ${row.hr}`] : []), ...selected.historicalAliases
    ].filter(Boolean))];
    return {
      id: selected.id, name: selected.name, aliases,
      frame: contract.catalogFrame, epochJulianYear: 2000,
      raDeg: position.raDeg, decDeg: position.decDeg,
      astrometrySourceId: contract.sourceId,
      provenance: {
        hygId: row.id, hipId: row.hip, locator: `HYG v4.1 id=${row.id}; HIP ${row.hip}`,
        rawRowFile: "sources/hyg-selected.json",
        sourceFrameInterpretation: contract.sourceFrameInterpretation,
        sourceFrameBasis: contract.sourceFrameBasis,
        sourceEpochJulianYear: contract.sourceDeclaredEpochJulianYear,
        frameDerivation: contract.frameDerivation
      },
      properMotion: position.motion === null ? null : {
        raCosDecMasPerYear: position.motion.raCosDec,
        decMasPerYear: position.motion.dec, sourceId: contract.sourceId
      },
      historicalAttributions
    };
  });
  return stars.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function catalogModule(stars) {
  return '// SPDX-License-Identifier: CC-BY-SA-4.0\n' +
    '// HYG Database v4.1, David Nash / Astronexus. See ../NOTICE.txt.\n' +
    '// Selected rows, converted units and ICRS axes through the engine bias.\n' +
    '// Generated by scripts/build-catalog.mjs; edit selection or generator.\n' +
    'import type { CatalogStar } from "./types.js";\n\n' +
    `export const catalogData = ${JSON.stringify(stars, null, 2)} as const satisfies readonly CatalogStar[];\n`;
}

async function main() {
  const args = process.argv.slice(2);
  assert(args.length <= 1 && [undefined, "--check", "--fetch"].includes(args[0]),
    "usage: node fixedstars/scripts/build-catalog.mjs [--check|--fetch]");
  const manifest = readJson("sources/manifest.json");
  const resource = manifest.resources.find(({ id }) => id === "hyg-v41-csv");
  const selection = readJson("sources/selection.json");
  const raw = args[0] === "--fetch"
    ? await selectHyg(resource, selection.stars)
    : readJson("sources/hyg-selected.json");
  assert.equal(raw.sourceSha256, resource.sha256, "raw selection source differs");
  assert.equal(raw.header, resource.csvHeader, "raw header differs");
  assert.equal(raw.sourceBytes, readJson("sources/retrieval.json").resources.find(({ id }) => id === resource.id).bytes);
  // Compile the existing source bridge in memory. Nothing writes engine dist/.
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL("src/catalog-import.ts", project))],
    alias: { "astronomy-engine": fileURLToPath(new URL("node_modules/astronomy-engine/esm/astronomy.js", project)) },
    bundle: true, format: "esm", platform: "node", write: false
  });
  const { convertIcrsAstrometry } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  const stars = buildCatalog(raw, selection, readJson("sources/lore-passages.json"), manifest.astrometryImport, convertIcrsAstrometry);
  const module = catalogModule(stars);
  assert(Buffer.byteLength(module) < 2_000_000, "catalog module exceeds file budget");
  assert(Buffer.byteLength(stringify(raw)) < 2_000_000, "raw selection exceeds file budget");
  const target = new URL("src/catalog-data.ts", project);
  if (args[0] === "--check") assert.equal(readFileSync(target, "utf8"), module, "catalog regeneration differs");
  else {
    if (args[0] === "--fetch") writeFileSync(new URL("sources/hyg-selected.json", project), stringify(raw));
    writeFileSync(target, module);
  }
  console.log(`${stars.length} selected stars ${args[0] === "--check" ? "match the committed catalog" : "generated"}; HYG source ${raw.sourceSha256}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
