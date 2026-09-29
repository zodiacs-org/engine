/*
 * The two engines the tools compare: this tree's build (dist/, after
 * `npm run build`) and 0.1.1-rc.15 as carried
 * (artifacts/zodiacs-engine-0.1.1-rc.15.tgz, checked against its receipt and
 * unpacked under TMPDIR, outside the checkout). Both resolve astronomy-engine
 * from the checkout's node_modules.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const ARCHIVE = join(ROOT, "artifacts/zodiacs-engine-0.1.1-rc.15.tgz");

/** Unpacks rc.15 into a new directory under TMPDIR; returns its dist/ and a cleanup. */
export function unpackRc15() {
  const archive = readFileSync(ARCHIVE);
  const sha256 = createHash("sha256").update(archive).digest("hex");
  const receipt = readFileSync(ARCHIVE.replace(/\.tgz$/, ".sha256"), "utf8").split(/\s+/)[0];
  if (sha256 !== receipt) throw new Error("the rc.15 archive does not match its receipt");
  const scratch = mkdtempSync(join(tmpdir(), "nutation-rc15-"));
  if (!relative(ROOT, scratch).startsWith("..")) throw new Error("TMPDIR must be outside the checkout");
  mkdirSync(join(scratch, "rc15"));
  const untar = spawnSync("tar", ["-xzf", ARCHIVE, "-C", join(scratch, "rc15")], { stdio: "inherit" });
  if (untar.status !== 0) throw new Error("tar failed");
  mkdirSync(join(scratch, "node_modules"));
  symlinkSync(join(ROOT, "node_modules/astronomy-engine"), join(scratch, "node_modules/astronomy-engine"));
  return {
    dist: join(scratch, "rc15/package/dist"),
    scratch,
    sha256,
    cleanup: () => rmSync(scratch, { recursive: true, force: true })
  };
}

/** This tree's build. */
export const BUILD = join(ROOT, "dist");
