// How much room a natal envelope leaves its caller's `extensions` under
// NATAL_ENVELOPE_LIMITS, on the carried 1.0.0 archive and on this build, for
// the synthetic chart of src/receipt-ids.test.ts (1990-06-15 12:30 UTC in New
// York, Placidus): the envelope's serialized bytes without extensions, and the
// longest string and the longest array of zeros that createNatalEnvelope
// accepts as `extensions.pad`, each found by bisection. The archive is
// checked against its receipt and unpacked under TMPDIR, outside the checkout,
// with the checkout's astronomy-engine. Each package runs in its own process,
// since each installs its ΔT model in astronomy-engine. Run from the checkout
// after `npm run build`:
//
//   node docs/evidence/1.1.0-rc.1-20261026/tools/extension-room.mjs > docs/evidence/1.1.0-rc.1-20261026/results/extension-room.txt
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

if (process.argv[2] === "--measure") {
  const dist = process.argv[3];
  const { ENGINE_VERSION, natalChart } = await import(pathToFileURL(join(dist, "index.js")).href);
  const { createNatalEnvelope, serializeNatalEnvelope, NATAL_ENVELOPE_LIMITS } = await import(pathToFileURL(join(dist, "receipt.js")).href);
  const chart = natalChart({ utc: "1990-06-15T12:30:00Z", latitude: 40.7128, longitude: -74.006, houseSystem: "placidus" });
  const accepts = (pad) => {
    try {
      createNatalEnvelope(chart, { extensions: { pad } });
      return true;
    } catch {
      return false;
    }
  };
  const longest = (make) => {
    let low = 0;
    let high = NATAL_ENVELOPE_LIMITS.bytes;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (accepts(make(middle))) low = middle;
      else high = middle - 1;
    }
    return low;
  };
  process.stdout.write(`${JSON.stringify({
    engine: ENGINE_VERSION,
    limits: NATAL_ENVELOPE_LIMITS,
    envelopeBytes: Buffer.byteLength(serializeNatalEnvelope(createNatalEnvelope(chart))),
    longestString: longest((n) => "x".repeat(n)),
    longestArray: longest((n) => new Array(n).fill(0))
  })}\n`);
} else {
  const archive = join(ROOT, "artifacts/zodiacs-engine-1.0.0.tgz");
  const sha256 = createHash("sha256").update(readFileSync(archive)).digest("hex");
  if (sha256 !== readFileSync(archive.replace(/\.tgz$/u, ".sha256"), "utf8").split(/\s+/u)[0]) throw new Error("the 1.0.0 archive does not match its receipt");
  const scratch = mkdtempSync(join(tmpdir(), "extension-room-"));
  try {
    if (!relative(ROOT, scratch).startsWith("..")) throw new Error("TMPDIR must be outside the checkout");
    mkdirSync(join(scratch, "engine"));
    if (spawnSync("tar", ["-xzf", archive, "-C", join(scratch, "engine")], { stdio: "inherit" }).status !== 0) throw new Error("tar failed");
    mkdirSync(join(scratch, "node_modules"));
    symlinkSync(join(ROOT, "node_modules/astronomy-engine"), join(scratch, "node_modules/astronomy-engine"));
    const measure = (dist) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--measure", dist], { encoding: "utf8" }));
    const before = measure(join(scratch, "engine/package/dist"));
    const after = measure(join(ROOT, "dist"));
    console.log(`# node tools/extension-room.mjs; Node ${process.version}, ${process.platform}-${process.arch}, ${new Date().toISOString().slice(0, 10)}`);
    console.log(`limits: ${JSON.stringify(after.limits)} (1.0.0: ${JSON.stringify(before.limits)})`);
    console.log(`1.0.0, artifacts/zodiacs-engine-1.0.0.tgz (SHA-256 ${sha256}): envelope ${before.envelopeBytes} bytes; longest extensions.pad string ${before.longestString} characters; longest array of zeros ${before.longestArray} entries`);
    console.log(`${after.engine}, this build: envelope ${after.envelopeBytes} bytes; longest extensions.pad string ${after.longestString} characters; longest array of zeros ${after.longestArray} entries`);
    console.log(`difference: envelope +${after.envelopeBytes - before.envelopeBytes} bytes; string ${after.longestString - before.longestString}; array ${after.longestArray - before.longestArray}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
