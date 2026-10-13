import { fork, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePlaceDataset } from "../src/dataset.js";
import { IndexLoadError, loadPlaceIndex } from "../src/load-index.js";
import type { IndexManifest } from "../src/build-index.js";
import type { PlaceRecord } from "../src/types.js";

// Acquisition-command tests require Python 3, but never access the network.
const project = fileURLToPath(new URL("../", import.meta.url));
let suiteDirectory: string;
let buildCommand: string;

function run(executable: string, args: string[], input?: Buffer) {
  const result = spawnSync(executable, args, {
    cwd: project,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    ...(input === undefined ? {} : { input })
  });
  if (result.error) throw result.error;
  return result;
}

function succeeds(executable: string, args: string[], input?: Buffer): string {
  const result = run(executable, args, input);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function directory(): Promise<string> {
  return mkdtemp(join(suiteDirectory, "case-"));
}

function syntheticPlaces(count: number): Buffer {
  return Buffer.from(Array.from({ length: count }, (_, i) => [
    String(900000000000001 + i), `Synthetic Harbour ${i}`, `Synthetic Harbour ${i}`, "東".repeat(110),
    "-77.625", "163.1234567", "P", "PPL", "ZQ", "", "01", "", "", "", "0", "", "12", "Etc/UTC", "2024-02-29"
  ].join("\t")).join("\n") + "\n");
}

async function sourceArchive(parent: string, places: Buffer): Promise<string> {
  const sources = join(parent, "sources");
  await mkdir(sources);
  succeeds("python3", ["-c", [
    "import sys, zipfile",
    "with zipfile.ZipFile(sys.argv[1], 'w', compression=zipfile.ZIP_DEFLATED) as archive:",
    "    archive.writestr('cities15000.txt', sys.stdin.buffer.read())"
  ].join("\n"), join(sources, "cities15000.zip")], places);
  await writeFile(join(sources, "countryInfo.txt"), [
    "ZQ", "ZQQ", "999", "", "Invented Country", "", "", "", "", "", "", "", "", "", "", "", "900000000000010", "", ""
  ].join("\t") + "\n");
  await writeFile(join(sources, "admin1CodesASCII.txt"), "ZQ.01\tInvented Region\tInvented Region\t900000000000011\n");
  return sources;
}

function download(sources: string, output: string) {
  return run("python3", ["scripts/download-inputs.py", "--source-dir", sources, "--out", output]);
}

async function loadIndex(output: string): Promise<{ manifest: IndexManifest; places: PlaceRecord[] }> {
  const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8")) as IndexManifest;
  const places: PlaceRecord[] = [];
  for (const shard of manifest.shards) {
    const bytes = await readFile(join(output, shard.file));
    expect(bytes.byteLength).toBe(shard.bytes);
    expect(bytes.byteLength).toBeLessThan(2_000_000);
    expect(sha256(bytes)).toBe(shard.sha256);
    const dataset = parsePlaceDataset(JSON.parse(bytes.toString("utf8")) as unknown);
    expect(dataset.provenance).toEqual(manifest.provenance);
    expect(dataset.places).toHaveLength(shard.count);
    places.push(...dataset.places);
  }
  expect(places).toHaveLength(manifest.count);
  return { manifest, places };
}

beforeAll(async () => {
  await mkdir(join(project, ".tmp"), { recursive: true });
  suiteDirectory = await mkdtemp(join(project, ".tmp", "command-tests-"));
  const compiled = join(suiteDirectory, "compiled");
  succeeds(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.tools.json", "--outDir", compiled]);
  buildCommand = join(compiled, "scripts", "build-index.js");
}, 20_000);

afterAll(async () => {
  if (suiteDirectory) await rm(suiteDirectory, { recursive: true, force: true });
});

describe("offline data acquisition and build commands", () => {
  it("leaves no published index after process termination during staging", async () => {
    const parent = await directory();
    const output = join(parent, "killed-index");
    const child = fork(buildCommand, ["--sample", "--out", output], {
      cwd: project, silent: true, execPath: process.execPath,
      execArgv: ["--import", join(project, "tests", "fixtures", "pause-build.mjs")]
    });
    try {
      const message = once(child, "message", { signal: AbortSignal.timeout(10_000) });
      const earlyExit = once(child, "exit").then(() => { throw new Error("Builder exited before staging"); });
      const [received] = await Promise.race([message, earlyExit]);
      expect((received as { stagedShard: string }).stagedShard).toContain(".killed-index.building-");
      await expect(loadPlaceIndex(output)).rejects.toThrow(IndexLoadError);
      const exit = once(child, "exit");
      child.kill("SIGKILL");
      expect((await exit)[1]).toBe("SIGKILL");
      await expect(access(output)).rejects.toThrow();
      expect((await readdir(parent)).filter((name) => name.startsWith(".killed-index."))).toHaveLength(2);
      // An abandoned lock needs explicit recovery; a retry cannot delete it.
      expect(run(process.execPath, [buildCommand, "--sample", "--out", output]).status).toBe(1);
      expect((await readdir(parent)).filter((name) => name.startsWith(".killed-index."))).toHaveLength(2);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exit = once(child, "exit");
        child.kill("SIGKILL");
        await exit;
      }
    }
  }, 15_000);

  it.each(["duplicate", "symlink", "nul-name", "encrypted", "unsupported-compression", "oversized", "crc", "truncated"])("rejects a malformed local archive: %s", async (kind) => {
    const parent = await directory();
    const sources = await sourceArchive(parent, syntheticPlaces(1));
    succeeds("python3", ["-c", [
      "import io, struct, sys, zipfile",
      "path, kind = sys.argv[1:]",
      "if kind == 'truncated':",
      "    open(path, 'wb').write(b'PK\\x03\\x04broken')",
      "else:",
      "    data = io.BytesIO()",
      "    with zipfile.ZipFile(data, 'w') as archive:",
      "        info = zipfile.ZipInfo('cities15000.txt' if kind != 'nul-name' else 'cities15000.txtxsuffix')",
      "        if kind == 'symlink':",
      "            info.create_system = 3",
      "            info.external_attr = 0o120777 << 16",
      "        if kind == 'unsupported-compression': info.compress_type = zipfile.ZIP_BZIP2",
      "        archive.writestr(info, b'synthetic')",
      "        if kind == 'duplicate': archive.writestr('cities15000.txt', b'other')",
      "    raw = bytearray(data.getvalue())",
      "    central = raw.index(b'PK\\x01\\x02')",
      "    if kind == 'oversized': struct.pack_into('<I', raw, central + 24, 64_000_001)",
      "    if kind == 'crc': struct.pack_into('<I', raw, central + 16, 0)",
      "    if kind == 'encrypted':",
      "        struct.pack_into('<H', raw, 6, 1)",
      "        struct.pack_into('<H', raw, central + 8, 1)",
      // ZipInfo strips NUL while writing, so insert one in both filename fields.
      "    if kind == 'nul-name':",
      "        raw[30 + len('cities15000.txt')] = 0",
      "        raw[central + 46 + len('cities15000.txt')] = 0",
      "    open(path, 'wb').write(raw)"
    ].join("\n"), join(sources, "cities15000.zip"), kind]);
    const output = join(parent, "downloaded");
    const result = download(sources, output);
    expect(result.status).not.toBe(0);
    await expect(access(output)).rejects.toThrow();
    expect((await readdir(parent)).filter((name) => name.startsWith(".downloaded."))).toEqual([]);
  });

  it("stages acquisition and cleans it after a failed metadata write", async () => {
    const parent = await directory();
    const sources = await sourceArchive(parent, syntheticPlaces(1));
    const output = join(parent, "downloaded");
    const result = run("python3", ["-c", [
      "import pathlib, runpy, sys",
      "script, sources, output = sys.argv[1:]",
      "sys.path.insert(0, str(pathlib.Path(script).resolve().parent))",
      "tool = runpy.run_path(script)",
      "original = pathlib.Path.write_bytes",
      "def fail(path, raw):",
      "    assert not pathlib.Path(output).exists(), 'output visible before completion'",
      "    if path.name == 'countries.tsv':",
      "        original(path, b'partial')",
      "        raise OSError('manufactured disk failure')",
      "    return original(path, raw)",
      "pathlib.Path.write_bytes = fail",
      "tool['download'](pathlib.Path(output), 'cities15000.zip', pathlib.Path(sources))"
    ].join("\n"), "scripts/download-inputs.py", sources, output]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("manufactured disk failure");
    await expect(access(output)).rejects.toThrow();
    expect((await readdir(parent)).filter((name) => name.startsWith(".downloaded."))).toEqual([]);
    expect(download(sources, output).status).toBe(0);
  });

  it.each(["duplicate-role", "wrong-license", "symlink", "invalid-utf8"])("rejects a damaged download receipt: %s", async (kind) => {
    const parent = await directory();
    const sources = await sourceArchive(parent, syntheticPlaces(1));
    const downloaded = join(parent, "downloaded");
    expect(download(sources, downloaded).status).toBe(0);
    const path = join(downloaded, "sources.json");
    const receipt = JSON.parse(await readFile(path, "utf8"));
    if (kind === "duplicate-role") receipt.inputs[1] = receipt.inputs[0];
    if (kind === "wrong-license") receipt.license = "unsupported";
    if (kind === "invalid-utf8") await writeFile(path, Buffer.from([0xff]));
    else if (kind === "symlink") {
      await rename(path, join(parent, "receipt.json"));
      await symlink(join(parent, "receipt.json"), path);
    } else await writeFile(path, JSON.stringify(receipt));
    const output = join(parent, "index");
    expect(run(process.execPath, [buildCommand, "--downloaded", downloaded, "--out", output]).status).toBe(1);
    await expect(access(output)).rejects.toThrow();
  });

  it("preserves archived source bytes across small parts and builds those parts through the CLI", async () => {
    const parent = await directory();
    const raw = syntheticPlaces(2500);
    expect(raw.byteLength).toBeGreaterThan(1_000_000);
    expect(raw.byteLength).toBeLessThan(2_000_000);
    const sources = await sourceArchive(parent, raw);
    const downloaded = join(parent, "downloaded");
    const acquired = download(sources, downloaded);
    expect(acquired.status, acquired.stderr).toBe(0);
    const parts = (await readdir(join(downloaded, "places"))).sort();
    expect(parts.length).toBeGreaterThan(1);
    const buffers: Buffer[] = [];
    for (const [i, file] of parts.entries()) {
      expect(file).toBe(`part-${String(i).padStart(6, "0")}.tsv`);
      const bytes = await readFile(join(downloaded, "places", file));
      expect(bytes.byteLength).toBeLessThanOrEqual(1_000_000);
      buffers.push(bytes);
    }
    expect(Buffer.concat(buffers)).toEqual(raw);
    const receipt = JSON.parse(await readFile(join(downloaded, "sources.json"), "utf8")) as {
      inputs: Array<{ path: string; sha256: string; memberSha256?: string; archiveMember?: string }>;
    };
    const placeInput = receipt.inputs.find((item) => item.path === "places")!;
    expect(placeInput.archiveMember).toBe("cities15000.txt");
    expect(placeInput.memberSha256).toBe(sha256(raw));
    expect(placeInput.sha256).toBe(sha256(await readFile(join(sources, "cities15000.zip"))));
    for (const [source, output] of [["countryInfo.txt", "countries.tsv"], ["admin1CodesASCII.txt", "admin1.tsv"]] as const) {
      const bytes = await readFile(join(downloaded, output));
      expect(bytes).toEqual(await readFile(join(sources, source)));
      expect(receipt.inputs.find((item) => item.path === output)!.sha256).toBe(sha256(bytes));
    }
    const output = join(parent, "index");
    const result = JSON.parse(succeeds(process.execPath, [buildCommand, "--downloaded", downloaded, "--out", output])) as { count: number };
    expect(result.count).toBe(2500);
    const { manifest, places } = await loadIndex(output);
    expect(manifest.provenance.sources.find((source) => source.file === "places")!.sha256).toBe(sha256(raw));
    expect(places.map((place) => place.id)).toEqual(Array.from({ length: 2500 }, (_, i) => `geonames:${900000000000001 + i}`));
    expect(places.every((place) => place.aliases[0] === "東".repeat(110))).toBe(true);
    expect(places[0]).toMatchObject({ latitude: -77.625, longitude: 163.1234567, elevationMeters: null, demElevationMeters: 12 });
  });

  it("builds the committed sample with receipt-bound inputs through --sample", async () => {
    const parent = await directory();
    const output = join(parent, "sample-index");
    succeeds(process.execPath, [buildCommand, "--sample", "--out", output]);
    const sample = JSON.parse(await readFile(join(project, "data", "sample-receipt.json"), "utf8")) as {
      outputs: Array<{ file: string; sha256: string; rows: number }>;
    };
    const { manifest, places } = await loadIndex(output);
    expect(places).toHaveLength(sample.outputs.find((entry) => entry.file === "geonames-sample.tsv")!.rows);
    for (const input of manifest.provenance.sources) {
      expect(input.sha256).toBe(sample.outputs.find((entry) => entry.file === input.file)!.sha256);
    }
  });

  it("refuses existing download and build outputs without overwriting their files", async () => {
    const parent = await directory();
    const sources = await sourceArchive(parent, syntheticPlaces(1));
    const existing = join(parent, "existing");
    await mkdir(existing);
    await writeFile(join(existing, "keep.txt"), "unchanged sentinel");
    expect(download(sources, existing).status).not.toBe(0);
    expect(run(process.execPath, [buildCommand, "--sample", "--out", existing]).status).not.toBe(0);
    expect(await readdir(existing)).toEqual(["keep.txt"]);
    expect(await readFile(join(existing, "keep.txt"), "utf8")).toBe("unchanged sentinel");
  });

  it("rejects changed downloaded input bytes before publishing an index", async () => {
    const parent = await directory();
    const sources = await sourceArchive(parent, syntheticPlaces(1));
    const downloaded = join(parent, "downloaded");
    expect(download(sources, downloaded).status).toBe(0);
    const part = join(downloaded, "places", "part-000000.tsv");
    await writeFile(part, (await readFile(part, "utf8")).replace("Synthetic Harbour", "Altered Harbour"));
    const output = join(parent, "index");
    const result = run(process.execPath, [buildCommand, "--downloaded", downloaded, "--out", output]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("digest mismatch");
    await expect(access(output)).rejects.toThrow();
  });

  it("cleans a failed local download when the archive lacks its expected member", async () => {
    const parent = await directory();
    const sources = await sourceArchive(parent, syntheticPlaces(1));
    succeeds("python3", ["-c", [
      "import sys, zipfile",
      "with zipfile.ZipFile(sys.argv[1], 'w') as archive:",
      "    archive.writestr('unexpected.txt', 'synthetic data')"
    ].join("\n"), join(sources, "cities15000.zip")]);
    const output = join(parent, "downloaded");
    const result = download(sources, output);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("archive member");
    await expect(access(output)).rejects.toThrow();
  });

  it("reports help and rejects mixed convenience modes", async () => {
    expect(succeeds(process.execPath, [buildCommand, "--help"])).toContain("--downloaded");
    const parent = await directory();
    const output = join(parent, "index");
    const result = run(process.execPath, [buildCommand, "--sample", "--downloaded", parent, "--out", output]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("accept only --out");
    await expect(access(output)).rejects.toThrow();
  });
});
