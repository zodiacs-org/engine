// How the receipt codec of every carried archive (artifacts/archives.json,
// status "carried", each checked against its digest) answers a natal
// envelope that this tree writes, for a synthetic chart: as written, with
// `requiredFeatures: ["convention-ids"]`, and with that feature taken out.
// Each archive is unpacked under TMPDIR, outside the checkout, with the
// checkout's astronomy-engine. Run from the checkout after `npm run build`:
//
//   node docs/evidence/1.1.0-rc.1-20261026/tools/earlier-readers.mjs > docs/evidence/1.1.0-rc.1-20261026/results/earlier-readers.json
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const load = (path) => import(pathToFileURL(path).href);

const { ENGINE_VERSION, natalChart } = await load(join(ROOT, "dist/index.js"));
const build = await load(join(ROOT, "dist/receipt.js"));
const written = build.serializeNatalEnvelope(
  build.createNatalEnvelope(natalChart({ utc: "1990-06-15T12:30:00Z", latitude: 40.7128, longitude: -74.006, houseSystem: "placidus" }))
);
const withoutFeature = JSON.stringify({ ...JSON.parse(written), requiredFeatures: [] });
const answers = (codec) => {
  const answer = (json) => {
    const parsed = codec.parseNatalEnvelope(json);
    return parsed.ok ? "ok" : parsed.code;
  };
  return { asWritten: answer(written), withoutFeature: answer(withoutFeature) };
};

const archives = [];
for (const archive of JSON.parse(readFileSync(join(ROOT, "artifacts/archives.json"), "utf8")).archives) {
  if (archive.status !== "carried") continue;
  const file = join(ROOT, "artifacts", archive.file);
  if (sha256(readFileSync(file)) !== archive.sha256) throw new Error(`${archive.file} does not match artifacts/archives.json`);
  const scratch = mkdtempSync(join(tmpdir(), "earlier-readers-"));
  try {
    if (!relative(ROOT, scratch).startsWith("..")) throw new Error("TMPDIR must be outside the checkout");
    mkdirSync(join(scratch, "engine"));
    if (spawnSync("tar", ["-xzf", file, "-C", join(scratch, "engine")], { stdio: "inherit" }).status !== 0)
      throw new Error("tar failed");
    mkdirSync(join(scratch, "node_modules"));
    symlinkSync(join(ROOT, "node_modules/astronomy-engine"), join(scratch, "node_modules/astronomy-engine"));
    archives.push({ version: archive.version, sha256: archive.sha256, ...answers(await load(join(scratch, "engine/package/dist/receipt.js"))) });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
process.stdout.write(
  `${JSON.stringify({ envelope: { engine: ENGINE_VERSION, requiredFeatures: JSON.parse(written).requiredFeatures, sha256: sha256(written) }, thisBuild: answers(build), archives }, null, 2)}\n`
);
