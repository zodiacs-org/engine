import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { INDEX_FILE_LIMIT } from "./build-index.js";
import type { IndexManifest } from "./build-index.js";
import { parsePlaceDataset } from "./dataset.js";
import type { PlaceDataset, PlaceRecord } from "./types.js";

/** Does not expose submitted paths, file contents or underlying filesystem errors. */
export class IndexLoadError extends Error {
  override readonly name = "IndexLoadError";

  constructor() {
    super("Unable to load a valid local place index.");
  }
}

function invalid(): never {
  throw new IndexLoadError();
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some((key) => !Object.hasOwn(row, key))) invalid();
  return row;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}

function manifest(value: unknown): IndexManifest {
  const row = object(value, ["schemaVersion", "format", "provenance", "count", "transformations", "shards"]);
  if (row.schemaVersion !== 1 || row.format !== "geocode-index") invalid();
  // The dataset parser owns source attribution and licensing validation.
  const provenance = parsePlaceDataset({ schemaVersion: 1, provenance: row.provenance, places: [] }).provenance;
  const changes = object(row.transformations, ["trimmedLabels", "omittedAliases", "duplicateAliases"]);
  const transformations = {
    trimmedLabels: count(changes.trimmedLabels),
    omittedAliases: count(changes.omittedAliases),
    duplicateAliases: count(changes.duplicateAliases)
  };
  if (!Array.isArray(row.shards)) invalid();
  const names = new Set<string>();
  let total = 0;
  const shards = row.shards.map((entry: unknown) => {
    const shard = object(entry, ["file", "sha256", "bytes", "count"]);
    // Match builder filenames only, excluding paths, drive letters and URLs.
    if (typeof shard.file !== "string" || !/^places-[0-9]{6}\.json$/u.test(shard.file)
        || names.has(shard.file)) invalid();
    names.add(shard.file);
    if (typeof shard.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(shard.sha256)) invalid();
    const bytes = count(shard.bytes);
    const rows = count(shard.count);
    if (bytes === 0 || bytes >= INDEX_FILE_LIMIT || rows === 0) invalid();
    total += rows;
    if (!Number.isSafeInteger(total)) invalid();
    return { file: shard.file, sha256: shard.sha256, bytes, count: rows };
  });
  if (count(row.count) !== total) invalid();
  return { schemaVersion: 1, format: "geocode-index", provenance, count: total, transformations, shards };
}

async function readBytes(path: string): Promise<Buffer> {
  const before = await lstat(path);
  if (!before.isFile() || before.size >= INDEX_FILE_LIMIT) invalid();
  // Refuse final-component symlinks and avoid blocking on special files.
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size >= INDEX_FILE_LIMIT) invalid();
    // One extra byte detects growth without permitting an unbounded read.
    const bytes = Buffer.allocUnsafe(stat.size + 1);
    let used = 0;
    while (used < bytes.length) {
      const result = await file.read(bytes, used, bytes.length - used, null);
      if (result.bytesRead === 0) break;
      used += result.bytesRead;
    }
    if (used !== stat.size) invalid();
    return bytes.subarray(0, used);
  } finally {
    await file.close();
  }
}

function json(bytes: Buffer): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)) as unknown;
}

/** Load a complete local dataset or all matching shards of a builder manifest. No network I/O. */
export async function loadPlaceIndex(path: string): Promise<PlaceDataset> {
  try {
    if (typeof path !== "string" || path.length === 0) invalid();
    const stat = await lstat(path);
    if (!stat.isFile() && !stat.isDirectory()) invalid();
    const input = stat.isDirectory() ? join(path, "manifest.json") : path;
    const value = json(await readBytes(input));
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, "format")) {
      return parsePlaceDataset(value);
    }
    const metadata = manifest(value);
    const expectedProvenance = JSON.stringify(metadata.provenance);
    const places: PlaceRecord[] = [];
    const ids = new Set<string>();
    for (const shard of metadata.shards) {
      const bytes = await readBytes(join(dirname(input), shard.file));
      if (bytes.length !== shard.bytes || createHash("sha256").update(bytes).digest("hex") !== shard.sha256) invalid();
      const dataset = parsePlaceDataset(json(bytes));
      if (dataset.places.length !== shard.count || JSON.stringify(dataset.provenance) !== expectedProvenance) invalid();
      for (const place of dataset.places) {
        if (ids.has(place.id)) invalid();
        ids.add(place.id);
        places.push(place);
      }
    }
    return Object.freeze({ schemaVersion: 1, provenance: metadata.provenance, places: Object.freeze(places) });
  } catch {
    throw new IndexLoadError();
  }
}
