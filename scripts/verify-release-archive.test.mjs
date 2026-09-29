// Cases for scripts/verify-release-archive.mjs, which the release workflow
// runs on the archive it is about to publish. It passes only when exactly one
// carried entry names the archive and the archive's size, digest and receipt
// match that entry; every other case is refused. The last case runs it on the
// archives carried in this repository.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("./verify-release-archive.mjs", import.meta.url));
const REPOSITORY = fileURLToPath(new URL("..", import.meta.url));
const VERSION = "1.2.3-rc.4";
const FILE = `zodiacs-engine-${VERSION}.tgz`;
const RECEIPT = `zodiacs-engine-${VERSION}.sha256`;
const BYTES = Buffer.from("synthetic archive bytes\n");

const made = [];
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const scratch = () => { const dir = mkdtempSync(join(tmpdir(), "zodiacs-release-case-")); made.push(dir); return dir; };
const CARRIED = { version: VERSION, file: FILE, sha256: sha256(BYTES), bytes: BYTES.length, files: 1,
  sourceCommit: "0".repeat(40), status: "carried" };

// A work tree with artifacts/ holding one archive, its receipt and a manifest.
function tree({ entries = [CARRIED], receipt = `${CARRIED.sha256}  ${FILE}\n`, manifest } = {}) {
  const root = scratch();
  const artifacts = join(root, "artifacts");
  mkdirSync(artifacts);
  writeFileSync(join(artifacts, FILE), BYTES);
  writeFileSync(join(artifacts, RECEIPT), receipt);
  writeFileSync(join(artifacts, "archives.json"),
    manifest ?? `${JSON.stringify({ schema: "zodiacs.engine-archives.v1", archives: entries }, null, 2)}\n`);
  return { root, artifacts };
}

function run(root, version = VERSION) {
  const result = spawnSync(process.execPath, [SCRIPT, version, "--root", root], { encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("verify-release-archive", () => {
  it("passes an archive that matches its one carried entry and its receipt", () => {
    const { status, output } = run(tree().root);
    expect(output).toContain("matches its carried entry and receipt");
    expect(status).toBe(0);
  });

  it("refuses a version without a carried entry", () => {
    expect(run(tree().root, "1.2.3-rc.5")).toMatchObject({ status: 1 });
    const superseded = run(tree({ entries: [{ ...CARRIED, status: "superseded" }] }).root);
    expect(superseded.output).toContain("0 carried entries");
    expect(superseded.status).toBe(1);
  });

  it("refuses two carried entries for one version", () => {
    const { status, output } = run(tree({ entries: [CARRIED, CARRIED] }).root);
    expect(output).toContain("2 carried entries");
    expect(status).toBe(1);
  });

  it("refuses an entry that names another file, size or digest", () => {
    for (const change of [{ file: "zodiacs-engine-1.2.3.tgz" }, { bytes: BYTES.length + 1 }, { sha256: "f".repeat(64) }]) {
      expect(run(tree({ entries: [{ ...CARRIED, ...change }] }).root).status).toBe(1);
    }
  });

  it("refuses an archive whose bytes changed", () => {
    const { root, artifacts } = tree();
    writeFileSync(join(artifacts, FILE), Buffer.from("synthetic archive BYTES\n"));
    const { status, output } = run(root);
    expect(output).toContain("has SHA-256");
    expect(status).toBe(1);
  });

  it("refuses a receipt that is not the entry's digest, two spaces, the file name and a newline", () => {
    for (const receipt of [`${CARRIED.sha256}  ${FILE}`, `${CARRIED.sha256} ${FILE}\n`, `${"0".repeat(64)}  ${FILE}\n`,
      `${CARRIED.sha256}  ${FILE}\n\n`]) {
      expect(run(tree({ receipt }).root).status).toBe(1);
    }
  });

  it("refuses versions that are not strict", () => {
    const { root } = tree();
    for (const version of ["v1.2.3-rc.4", "1.2.3-rc.4+build", "01.2.3", "1.2", "1.2.3-rc.04", "1.2.3-rc.4\n", "../1.2.3", ""]) {
      const { status, output } = run(root, version);
      expect(output).toContain("is not a semantic version");
      expect(status).toBe(1);
    }
  });

  it("refuses symbolic links in place of the archive or of artifacts/", () => {
    const linkedFile = tree();
    const elsewhere = join(scratch(), FILE);
    writeFileSync(elsewhere, BYTES);
    rmSync(join(linkedFile.artifacts, FILE));
    symlinkSync(elsewhere, join(linkedFile.artifacts, FILE));
    expect(run(linkedFile.root).output).toContain("must be a regular file; it is a symbolic link");

    const linkedDirectory = tree();
    const moved = join(scratch(), "artifacts");
    renameSync(linkedDirectory.artifacts, moved);
    symlinkSync(moved, linkedDirectory.artifacts);
    const { status, output } = run(linkedDirectory.root);
    expect(output).toContain("artifacts/ must be a directory; it is a symbolic link");
    expect(status).toBe(1);
  });

  it("refuses a manifest that is not JSON", () => {
    const { status, output } = run(tree({ manifest: "{" }).root);
    expect(output).toContain("is not valid JSON");
    expect(status).toBe(1);
  });

  it("passes every archive carried in this repository", () => {
    const manifest = JSON.parse(readFileSync(join(REPOSITORY, "artifacts", "archives.json"), "utf8"));
    const carried = manifest.archives.filter((entry) => entry.status === "carried");
    expect(carried.length).toBeGreaterThan(0);
    for (const entry of carried) {
      const { status, output } = run(REPOSITORY, entry.version);
      expect(output).toContain(entry.sha256);
      expect(status).toBe(0);
    }
  });
});
