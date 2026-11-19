// Records across the major: whether this tree's receipt codec reads every
// natal envelope that an earlier release wrote.
//
// For every archive in artifacts/archives.json with status "carried", each
// checked against its SHA-256 before use, the archive is unpacked under
// TMPDIR (outside the checkout) with the checkout's astronomy-engine linked
// in, so nothing is fetched. Its own dist/index.js computes five synthetic
// charts (A to E below) and its own dist/receipt.js writes each as an
// envelope. This tree's dist/receipt.js then parses every envelope, and this
// tree's natalChart is given the decoded envelope's natalReplayInput.
//
// Before a pair is written, the archive's declarations are read: a house
// system missing from its HouseSystem type, or an option missing from its
// BirthInput, is recorded as "writer-unsupported" and not run. A writer that
// throws is recorded as "writer-refused" with the error's class.
//
// Run from the checkout after `npm run build`:
//
//   mkdir -p /tmp/later-reader
//   TMPDIR=/tmp/later-reader node docs/evidence/records-2.0.0-20261120/tools/later-reader.mjs \
//     > docs/evidence/records-2.0.0-20261120/results/later-reader.json
//
// With --write-fixtures it also writes src/fixtures/receipts-by-writer/<version>.json,
// one file per archive holding the envelopes it serialized, byte for byte.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../.."));
const TEMP = realpathSync(tmpdir());
const fromRoot = relative(ROOT, TEMP);
if (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`)) throw new Error("TMPDIR must be outside the checkout");
const FIXTURES = join(ROOT, "src/fixtures/receipts-by-writer");
const writeFixtures = process.argv.includes("--write-fixtures");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const load = (path) => import(pathToFileURL(path).href);

/** Synthetic charts: public places, arbitrary instants, every one a full instant. */
const INPUTS = {
  // The chart docs/evidence/1.1.0-rc.1-20261026/tools/earlier-readers.mjs writes.
  A: { utc: "1990-06-15T12:30:00Z", latitude: 40.7128, longitude: -74.006, houseSystem: "placidus" },
  // Inside the IERS table's first years. Whole-sign houses are spelled "whole"
  // in every archive's HouseSystem type and in this tree's.
  B: { utc: "1973-03-01T00:00:00Z", latitude: -33.8688, longitude: 151.2093, houseSystem: "whole" },
  // After the IERS table: the time basis changes at 2.0.0-rc.3.
  C: { utc: "2030-01-01T00:00:00Z", latitude: 51.4779, longitude: 0, houseSystem: "koch" },
  // Inside the polar circle: Placidus falls back to whole-sign houses.
  D: { utc: "1990-06-15T12:30:00Z", latitude: 78.2232, longitude: 15.6267, houseSystem: "placidus" },
  // No time, no place.
  E: { utc: "1990-06-15T00:00:00Z", timeKnown: false }
};

/** The house systems and BirthInput fields an archive declares, read from its dist/*.d.ts. */
function declarations(dist) {
  const text = readdirSync(dist)
    .filter((name) => name.endsWith(".d.ts"))
    .map((name) => readFileSync(join(dist, name), "utf8"))
    .join("\n");
  const houses = /type HouseSystem = ([^;]+);/.exec(text);
  const birth = /interface BirthInput \{([\s\S]*?)\n\}/.exec(text);
  if (!houses || !birth) throw new Error(`${dist}: no HouseSystem or BirthInput declaration`);
  return {
    houseSystems: [...houses[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]),
    birthInput: [...birth[1].replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/^\s*(\w+)\??:/gm)].map((match) => match[1])
  };
}

function unsupported(declared, input) {
  const missing = Object.keys(input).filter((key) => !declared.birthInput.includes(key));
  if (missing.length) return `BirthInput declares no ${missing.join(", ")}`;
  if (input.houseSystem && !declared.houseSystems.includes(input.houseSystem))
    return `HouseSystem declares no "${input.houseSystem}"`;
  return null;
}

const current = await load(join(ROOT, "dist/index.js"));
const codec = await load(join(ROOT, "dist/receipt.js"));
const SETS = codec.NATAL_RECEIPT_CONVENTION_SETS;

/** How this tree's codec answers one written envelope. */
function read(json) {
  const written = JSON.parse(json);
  const parsed = codec.parseNatalEnvelope(json);
  if (!parsed.ok) {
    return {
      read: parsed.code,
      engineVersion: written.receipt.engine.version,
      conventionSet: SETS.findIndex((conventions) => isDeepStrictEqual(conventions, written.receipt.conventions)),
      replay: "not-run"
    };
  }
  const { envelope } = parsed;
  const set = SETS.findIndex((conventions) => isDeepStrictEqual(conventions, envelope.receipt.conventions));
  let replay;
  try {
    current.natalChart(codec.natalReplayInput(envelope));
    replay = "accepted";
  } catch (error) {
    replay = `refused: ${error.constructor.name}`;
  }
  return {
    read: "ok",
    engineVersion: envelope.receipt.engine.version,
    conventionSet: set,
    namesWriter:
      envelope.receipt.engine.version === written.receipt.engine.version &&
      isDeepStrictEqual(envelope.receipt.conventions, written.receipt.conventions),
    sameAsWritten: isDeepStrictEqual(envelope, written),
    requiredFeatures: envelope.requiredFeatures,
    resultFlags: envelope.receipt.resultFlags,
    houses: envelope.result.houses?.system ?? null,
    timeBasis: envelope.result.timeScale?.basis ?? null,
    ut1Source: envelope.result.timeScale?.ut1MinusUtc?.source ?? null,
    replay
  };
}

const archives = [];
const fixtures = [];
const failures = [];
const listed = JSON.parse(readFileSync(join(ROOT, "artifacts/archives.json"), "utf8")).archives;
for (const version of [...new Set(listed.map((archive) => archive.version))]) {
  const carried = listed.find((archive) => archive.version === version && archive.status === "carried");
  if (!carried) {
    const statuses = [...new Set(listed.filter((archive) => archive.version === version).map((archive) => archive.status))];
    const file = join(ROOT, "artifacts", `zodiacs-engine-${version}.tgz`);
    if (existsSync(file)) throw new Error(`Unexpected archive for ${version}`);
    archives.push({ version, status: statuses.join(", "), run: "no archive" });
    continue;
  }
  const file = join(ROOT, "artifacts", carried.file);
  if (sha256(readFileSync(file)) !== carried.sha256) throw new Error(`${carried.file} does not match artifacts/archives.json`);
  const scratch = mkdtempSync(join(TEMP, "later-reader-"));
  try {
    mkdirSync(join(scratch, "engine"));
    if (spawnSync("tar", ["-xzf", file, "-C", join(scratch, "engine")], { stdio: "inherit" }).status !== 0)
      throw new Error("tar failed");
    mkdirSync(join(scratch, "node_modules"));
    symlinkSync(join(ROOT, "node_modules/astronomy-engine"), join(scratch, "node_modules/astronomy-engine"));
    const dist = join(scratch, "engine/package/dist");
    const row = { version, status: carried.status, sha256: carried.sha256, digest: "verified", run: "loaded", inputs: {} };
    let writer;
    try {
      writer = { root: await load(join(dist, "index.js")), receipt: await load(join(dist, "receipt.js")) };
    } catch (error) {
      const detail = `${error.constructor.name}: ${error.message.replaceAll(scratch, "<scratch>")}`;
      archives.push({ ...row, run: "did not load", error: detail });
      failures.push(`${version} did not load`);
      continue;
    }
    const declared = declarations(dist);
    const envelopes = {};
    for (const [name, input] of Object.entries(INPUTS)) {
      const reason = unsupported(declared, input);
      if (reason) {
        row.inputs[name] = { written: "writer-unsupported", reason };
        continue;
      }
      let json;
      try {
        json = writer.receipt.serializeNatalEnvelope(writer.receipt.createNatalEnvelope(writer.root.natalChart(input)));
      } catch (error) {
        row.inputs[name] = { written: "writer-refused", error: error.constructor.name };
        continue;
      }
      envelopes[name] = json;
      const answer = read(json);
      row.inputs[name] = { written: "ok", bytes: Buffer.byteLength(json), sha256: sha256(json), ...answer };
      if (answer.read !== "ok") {
        failures.push(`${version} ${name}: reader returned ${answer.read}`);
      } else if (!answer.namesWriter || answer.engineVersion !== version || answer.conventionSet < 0 || answer.replay !== "accepted") {
        failures.push(`${version} ${name}: reader metadata or replay differs from expectations`);
      }
    }
    archives.push(row);
    if (writeFixtures) {
      fixtures.push({
        version,
        archive: carried.file,
        sha256: carried.sha256,
        envelopes,
        notWritten: Object.fromEntries(
          Object.entries(row.inputs)
            .filter(([, answer]) => answer.written !== "ok")
            .map(([name, answer]) => [name, answer.reason ?? answer.error])
        )
      });
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (writeFixtures && failures.length === 0) {
  mkdirSync(FIXTURES, { recursive: true });
  for (const fixture of fixtures) {
    writeFileSync(join(FIXTURES, `${fixture.version}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
  }
}
process.stdout.write(
  `${JSON.stringify({ reader: { engine: current.ENGINE_VERSION, entry: "dist/receipt.js", node: process.version }, inputs: Object.keys(INPUTS), archives }, null, 2)}\n`
);
if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
}
