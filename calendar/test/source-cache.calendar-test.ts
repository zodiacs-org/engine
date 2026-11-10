import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { prepareEvents } from "../scripts/prepare-events.mjs";

const calendarDirectory = fileURLToPath(new URL("..", import.meta.url));
const cacheParent = path.join(calendarDirectory, ".cache");
const created: string[] = [];
let reference: string;

async function temporaryCache(copy = true): Promise<string> {
  const cache = await mkdtemp(path.join(cacheParent, "events-source-test-"));
  created.push(cache);
  if (copy) await cp(reference, cache, { recursive: true, verbatimSymlinks: true });
  return cache;
}

beforeAll(async () => {
  await mkdir(cacheParent, { recursive: true });
  reference = await temporaryCache(false);
  await prepareEvents({ cacheDirectory: reference });
});

afterAll(async () => {
  for (const cache of created) await rm(cache, { recursive: true, force: true });
});

test("extracts byte-exact pinned source and provenance with a relative engine link", async () => {
  const manifestBytes = await readFile(new URL("../events-source.json", import.meta.url));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
    commit: string; engineTree: string;
    files: { path: string; bytes: number; sha256: string }[];
  };
  expect(await prepareEvents({ check: true, cacheDirectory: reference })).toEqual({
    cacheDirectory: reference, commit: manifest.commit, engineTree: manifest.engineTree
  });
  expect(await readFile(path.join(reference, "events-source.json"))).toEqual(manifestBytes);
  for (const file of manifest.files) {
    const bytes = await readFile(path.join(reference, file.path));
    expect(bytes.length).toBe(file.bytes);
    expect(bytes.length).toBeLessThan(2_000_000);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
  }
  expect(await readlink(path.join(reference, "src"))).toBe("../../../src");
  expect(await realpath(path.join(reference, "src"))).toBe(await realpath(path.resolve(calendarDirectory, "../src")));
  const before = await lstat(path.join(reference, "events/src/search.ts"));
  await prepareEvents({ cacheDirectory: reference });
  expect((await lstat(path.join(reference, "events/src/search.ts"))).mtimeMs).toBe(before.mtimeMs);
});

test("check refuses a missing file and preparation restores it from the pinned blob", async () => {
  const cacheDirectory = await temporaryCache();
  const file = path.join(cacheDirectory, "events/src/longitude.ts");
  const original = await readFile(file);
  await rm(file);
  await expect(prepareEvents({ cacheDirectory, check: true })).rejects.toThrow("Missing pinned events cache file");
  await prepareEvents({ cacheDirectory });
  expect(await readFile(file)).toEqual(original);
});

test("corrupted source or provenance is rejected without being silently overwritten", async () => {
  const cacheDirectory = await temporaryCache();
  const file = path.join(cacheDirectory, "events/src/query.ts");
  const original = await readFile(file);
  const corrupted = Buffer.from(original);
  corrupted[0] = corrupted[0] === 0 ? 1 : 0;
  await writeFile(file, corrupted);
  await expect(prepareEvents({ cacheDirectory, check: true })).rejects.toThrow("Pinned events cache file changed");
  await expect(prepareEvents({ cacheDirectory })).rejects.toThrow("Pinned events cache file changed");
  expect(await readFile(file)).toEqual(corrupted);
  await writeFile(file, original);
  await writeFile(path.join(cacheDirectory, "events-source.json"), "{}");
  await expect(prepareEvents({ cacheDirectory, check: true })).rejects.toThrow("events-source.json");
});

test("refuses unpinned modules that could shadow relative source imports", async () => {
  const cacheDirectory = await temporaryCache();
  await writeFile(path.join(cacheDirectory, "events/src/query.js"), "export const parseQuery = null;\n");
  await expect(prepareEvents({ cacheDirectory, check: true })).rejects.toThrow("Unexpected events cache entry");
});

test("rejects escaping paths, linked output directories and altered engine links", async () => {
  await expect(prepareEvents({ cacheDirectory: path.join(calendarDirectory, "outside-cache") }))
    .rejects.toThrow("direct child of calendar/.cache");
  const linked = await temporaryCache(false);
  await rm(linked, { recursive: true });
  await symlink(reference, linked, "dir");
  await expect(prepareEvents({ cacheDirectory: linked })).rejects.toThrow("must not be a link");
  const cacheDirectory = await temporaryCache();
  await rm(path.join(cacheDirectory, "events/src"), { recursive: true });
  await symlink(path.join(reference, "events/src"), path.join(cacheDirectory, "events/src"), "dir");
  await expect(prepareEvents({ cacheDirectory })).rejects.toThrow("must not be a link");
  const badEngine = await temporaryCache();
  await rm(path.join(badEngine, "src"));
  await symlink("events/src", path.join(badEngine, "src"), "dir");
  await expect(prepareEvents({ cacheDirectory: badEngine })).rejects.toThrow("engine source link differs");
});
