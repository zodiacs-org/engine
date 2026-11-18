import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASELINE, INTERMEDIATE, PINNED, loadRelease
} from "../../../scripts/build-host-zone-probes.mjs";
import { MAIN_FILES } from "../../../scripts/build-tz-shards.mjs";
import { resolveLocalToUtc } from "../../../dist/geo.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
console.log(execFileSync("zdump", ["--version"], { encoding: "utf8" }).trim());
for (const release of [BASELINE, INTERMEDIATE, PINNED]) {
  const work = mkdtempSync(join(tmpdir(), "tehran-probe-"));
  try {
    const files = await loadRelease(root, release);
    for (const name of MAIN_FILES) writeFileSync(join(work, name), files.get(name));
    const out = join(work, "zoneinfo");
    execFileSync("zic", ["-b", "fat", "-d", out, ...MAIN_FILES.map((name) => join(work, name))]);
    console.log(release.version);
    console.log(execFileSync("zdump", ["-v", "-c", "1979,1980", join(out, "Asia/Tehran"), join(out, "Iran")], {
      encoding: "utf8"
    }).trim().replaceAll(out + "/", "").split("\n").filter((line) => !line.endsWith("NULL")).join("\n"));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

assert.equal(process.version, "v22.22.2");
assert.equal(process.versions.tz, INTERMEDIATE.version);
console.log(`Node ${process.version}, tzdb ${process.versions.tz}`);
for (const zone of ["Asia/Tehran", "Iran"]) {
  const { utc, flags, zone: { hostCheck } } = resolveLocalToUtc("1979-05-26", "12:00", zone);
  assert.equal(utc.toISOString(), "1979-05-26T08:30:00.000Z");
  assert.deepEqual(flags, ["host-zone-data-differs"]);
  assert.equal(hostCheck.status, "differs");
  console.log(JSON.stringify({ zone, utc, flags, hostCheck }));
}
