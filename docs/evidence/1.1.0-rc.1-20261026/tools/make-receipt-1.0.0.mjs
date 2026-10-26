// Serialize a draft natal receipt with the carried 1.0.0 archive, for the
// synthetic chart of src/fixtures/receipt-rc13.json to receipt-rc15.json
// (1990-06-15 08:30 in New York, Placidus), resolved as 1.0.0 resolves a local
// birth. It is a receipt of the set that 0.1.1-rc.16 to 1.0.0 wrote, which
// 1.1.0-rc.1 reads but no longer writes. src/fixtures/receipt-1.0.0.json is
// this script's output with one newline appended.
//
// The archive, artifacts/zodiacs-engine-1.0.0.tgz, is checked against its
// receipt and unpacked under TMPDIR, outside the checkout, with the
// checkout's astronomy-engine:
//
//   node docs/evidence/1.1.0-rc.1-20261026/tools/make-receipt-1.0.0.mjs > src/fixtures/receipt-1.0.0.json && echo >> src/fixtures/receipt-1.0.0.json
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ARCHIVE = join(ROOT, "artifacts/zodiacs-engine-1.0.0.tgz");
const archive = readFileSync(ARCHIVE);
const sha256 = createHash("sha256").update(archive).digest("hex");
if (sha256 !== readFileSync(ARCHIVE.replace(/\.tgz$/u, ".sha256"), "utf8").split(/\s+/u)[0])
  throw new Error("the 1.0.0 archive does not match its receipt");
const scratch = mkdtempSync(join(tmpdir(), "receipt-1.0.0-"));
try {
  if (!relative(ROOT, scratch).startsWith("..")) throw new Error("TMPDIR must be outside the checkout");
  mkdirSync(join(scratch, "engine"));
  if (spawnSync("tar", ["-xzf", ARCHIVE, "-C", join(scratch, "engine")], { stdio: "inherit" }).status !== 0)
    throw new Error("tar failed");
  mkdirSync(join(scratch, "node_modules"));
  symlinkSync(join(ROOT, "node_modules/astronomy-engine"), join(scratch, "node_modules/astronomy-engine"));
  const load = (name) => import(pathToFileURL(join(scratch, "engine/package/dist", name)).href);
  const { ENGINE_VERSION, natalChart } = await load("index.js");
  const { resolveLocalBirth } = await load("geo.js");
  const { createNatalEnvelope, serializeNatalEnvelope } = await load("receipt.js");
  if (ENGINE_VERSION !== "1.0.0") throw new Error(ENGINE_VERSION);
  const { birth, resolution, reference } = resolveLocalBirth({
    date: "1990-06-15",
    time: "08:30",
    timeZone: "America/New_York",
    latitude: 40.7128,
    longitude: -74.006,
    houseSystem: "placidus"
  });
  const envelope = createNatalEnvelope(natalChart(birth), { reference, localResolution: resolution.localResolution });
  process.stdout.write(serializeNatalEnvelope(envelope));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
