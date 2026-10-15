import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { preparePilot } from "../scripts/generate-pilot.ts";
import { createHorizonsCapture, sha256 } from "../src/horizons-client.ts";
import { encodeCoefficientShard } from "../src/coefficient-shard.ts";
import { loadMinorBodyEphemeris, POSITION_CONVENTIONS } from "../src/ephemeris.ts";
import type { EphemerisInput, MinorBodyEphemeris } from "../src/ephemeris.ts";
import type { MinorBody } from "../src/catalog.ts";
import type { MinorBodyTimeInput } from "../src/engine-bridge.ts";
import { readEngineSourceIdentity } from "../src/engine-identity.ts";
import { PILOT_RECIPE } from "../src/pilot-recipe.ts";

type Mutable<T> = { -readonly [P in keyof T]: Mutable<T[P]> };
const clone = <T>(value: T): Mutable<T> => JSON.parse(JSON.stringify(value)) as Mutable<T>;

let pilot: Awaited<ReturnType<typeof preparePilot>>;
let ephemeris: MinorBodyEphemeris;
let originals: Map<string, string>;

function input(overrides: Partial<EphemerisInput> = {}): EphemerisInput {
  return {
    sourceManifestText: pilot.sourceManifestText,
    sourceManifestSha256: sha256(pilot.sourceManifestText),
    rawSources: new Map(originals),
    shards: [{ text: pilot.text, descriptor: pilot.descriptor }],
    ...overrides
  };
}

/** Re-pin both sides so a later unrelated digest mismatch cannot hide a loader bug. */
function changedManifest(change: (manifest: Mutable<typeof pilot.sourceManifest>) => void, rawSources = new Map(originals)): EphemerisInput {
  const manifest = clone(pilot.sourceManifest);
  change(manifest);
  const text = JSON.stringify(manifest) + "\n";
  const shard = clone(pilot.shard);
  shard.provenance.sourceManifestSha256 = sha256(text);
  shard.provenance.generatorSha256 = manifest.generatorSha256;
  return input({ sourceManifestText: text, sourceManifestSha256: sha256(text), rawSources,
    shards: [encodeCoefficientShard(shard)] });
}

function changedShard(change: (shard: Mutable<typeof pilot.shard>) => void): EphemerisInput {
  const shard = clone(pilot.shard);
  change(shard);
  return input({ shards: [encodeCoefficientShard(shard)] });
}

beforeAll(async () => {
  pilot = await preparePilot();
  originals = new Map(pilot.sourceManifest.entries.map((entry, index) => [entry.rawFile, pilot.captures[index]!.capture.raw]));
  ephemeris = await loadMinorBodyEphemeris(input());
});

describe("offline minor-body positions and receipts", () => {
  it("loads and evaluates the frozen local dataset without network access", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("Network access is forbidden in runtime calculation."); });
    try {
      const loaded = await loadMinorBodyEphemeris(input());
      expect(loaded.calculate("Chiron", { jd: 2451600.25, scale: "tt" }).status).toBe("ok");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it("returns explicit units, conventions, provenance and a candid validation status", () => {
    const result = ephemeris.calculate("Chiron", { jd: 2451600.25, scale: "tt" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected the loaded pilot position.");
    expect(result.body).toBe("Chiron");
    expect(result.jdTt).toBe(2451600.25);
    for (const number of [result.longitudeDeg, result.latitudeDeg, result.distanceAu,
      result.longitudeSpeedDegPerDay, result.latitudeSpeedDegPerDay, result.distanceSpeedAuPerDay]) {
      expect(Number.isFinite(number)).toBe(true);
    }
    expect(result.longitudeDeg).toBeGreaterThanOrEqual(0);
    expect(result.longitudeDeg).toBeLessThan(360);
    expect(Math.abs(result.latitudeDeg)).toBeLessThanOrEqual(90);
    expect(result.distanceAu).toBeGreaterThan(0);
    expect(result.retrograde).toBe(result.longitudeSpeedDegPerDay < 0);
    expect(result.receipt.conventions).toEqual(POSITION_CONVENTIONS);
    expect(result.receipt.time?.source).toBe("explicit-tt");
    expect(result.receipt.time?.request).toEqual({ jd: result.jdTt, scale: "tt" });
    expect(result.receipt.dataset).toMatchObject({
      sourceManifestSha256: sha256(pilot.sourceManifestText),
      generatorSha256: pilot.sourceManifest.generatorSha256,
      sourceIdentity: pilot.sourceManifest.identity,
      validation: "accuracy-not-certified-by-loader",
      shardDigests: [pilot.descriptor.sha256]
    });
    expect(result.receipt.evaluatedShard).toEqual({ sha256: pilot.descriptor.sha256, segmentIndex: 3 });
    expect(result.receipt.engineSource.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("includes the first instant, assigns joins to the right segment, and excludes the last instant", () => {
    const start = ephemeris.calculate("Chiron", { jd: PILOT_RECIPE.startJdTt, scale: "tt" });
    expect(start.status).toBe("ok");
    expect(start.receipt.evaluatedShard?.segmentIndex).toBe(0);
    for (let i = 1; i < pilot.shard.segments.length; i++) {
      const joined = ephemeris.calculate("Chiron", { jd: pilot.shard.segments[i]!.startJdTt, scale: "tt" });
      expect(joined.status).toBe("ok");
      expect(joined.receipt.evaluatedShard?.segmentIndex).toBe(i);
    }
    expect(ephemeris.calculate("Chiron", { jd: PILOT_RECIPE.endJdTt - 1e-6, scale: "tt" }).status).toBe("ok");
    for (const jd of [PILOT_RECIPE.startJdTt - 1e-6, PILOT_RECIPE.endJdTt]) {
      const refused = ephemeris.calculate("Chiron", { jd, scale: "tt" });
      expect(refused).toMatchObject({ status: "refused", reason: "outside-coverage" });
      expect(refused.receipt.time?.jdTt).toBe(jd);
      expect(refused.receipt.evaluatedShard).toBeNull();
    }
  });

  it("checks installed coverage after conversion to TT and retains the engine's clock record", () => {
    const utc = ephemeris.calculate("Chiron", { date: "2000-01-01T00:00:00Z" });
    expect(utc.status).toBe("ok");
    expect(utc.receipt.time?.engineTimeBasis?.timeScale.input).toBe("utc");
    expect(utc.receipt.time?.engineTimeBasis?.timeScale.basis).toBe("iers");
    const beforeTtEnd = ephemeris.calculate("Chiron", { date: "2000-12-31T23:59:00Z" });
    expect(beforeTtEnd).toMatchObject({ status: "refused", reason: "outside-coverage" });
    const tt = ephemeris.calculate("Chiron", { date: "2000-12-31T23:59:00Z", timeScale: "tt" });
    expect(tt.status).toBe("ok");
  });

  it("returns structured refusals with dataset and convention receipts", () => {
    const validTime = { jd: PILOT_RECIPE.startJdTt, scale: "tt" as const };
    const refusals = [
      [ephemeris.calculate("chiron" as MinorBody, validTime), "unknown-body"],
      [ephemeris.calculate("Vesta", validTime), "body-unavailable"],
      [ephemeris.calculate("Chiron", { jd: NaN, scale: "tt" }), "invalid-time"],
      [ephemeris.calculate("Chiron", { date: "2000-02-30" }), "invalid-time"],
      [ephemeris.calculate("Chiron", { jd: 2451600, scale: "utc" } as unknown as MinorBodyTimeInput), "invalid-time"]
    ] as const;
    for (const [result, reason] of refusals) {
      expect(result).toMatchObject({ status: "refused", reason });
      expect(result.receipt.dataset.sourceManifestSha256).toBe(sha256(pilot.sourceManifestText));
      expect(result.receipt.conventions).toEqual(POSITION_CONVENTIONS);
      expect(result.receipt.evaluatedShard).toBeNull();
    }
    expect(refusals[0][0].receipt.body).toBeNull();
    expect(refusals[1][0].receipt.body).toBe("Vesta");
  });

  it("isolates loaded data and results from caller mutation", async () => {
    const descriptor = clone(pilot.descriptor);
    const shards = [{ text: pilot.text, descriptor }];
    const rawSources = new Map(originals);
    const loaded = await loadMinorBodyEphemeris(input({ shards, rawSources }));
    const date = new Date("2000-06-01T12:00:00Z");
    const before = loaded.calculate("Chiron", { date });
    rawSources.clear();
    shards[0]!.text = "corrupted after loading";
    descriptor.startJdTt = descriptor.endJdTt;
    descriptor.sha256 = "0".repeat(64);
    date.setUTCFullYear(1900);
    expect(loaded.calculate("Chiron", { date: "2000-06-01T12:00:00.000Z" })).toEqual(before);
    const visit = (value: unknown): void => {
      if (value !== null && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        for (const child of Object.values(value)) visit(child);
      }
    };
    visit(before);
    expect(Object.isFrozen(loaded)).toBe(true);
  });
});

describe("dataset loading integrity", () => {
  it("rejects changed manifest bytes and noncanonical encodings even when re-pinned", async () => {
    await expect(loadMinorBodyEphemeris(input({ sourceManifestText: pilot.sourceManifestText + " " }))).rejects.toThrow(/digest/);
    const noncanonical = JSON.stringify(pilot.sourceManifest, null, 2) + "\n";
    await expect(loadMinorBodyEphemeris(input({ sourceManifestText: noncanonical, sourceManifestSha256: sha256(noncanonical) })))
      .rejects.toThrow(/source manifest/);
  });

  it("requires every original response and rejects changed source bytes or unregistered files", async () => {
    const first = pilot.sourceManifest.entries[0]!.rawFile;
    const missing = new Map(originals);
    missing.delete(first);
    await expect(loadMinorBodyEphemeris(input({ rawSources: missing }))).rejects.toThrow();
    const corrupt = new Map(originals);
    corrupt.set(first, corrupt.get(first)! + " ");
    await expect(loadMinorBodyEphemeris(input({ rawSources: corrupt }))).rejects.toThrow(/source|capture|manifest|bytes|digest/i);
    const extra = new Map(originals);
    extra.set("unexpected.json", "{}");
    await expect(loadMinorBodyEphemeris(input({ rawSources: extra }))).rejects.toThrow();
  });

  it("rejects a mixed orbit solution even with self-consistent response hashes", async () => {
    const entry = pilot.sourceManifest.entries[1]!;
    const rawSources = new Map(originals);
    const changedRaw = rawSources.get(entry.rawFile)!.replaceAll(pilot.sourceManifest.identity.targetSource, "JPL#999999");
    expect(changedRaw).not.toBe(rawSources.get(entry.rawFile));
    rawSources.set(entry.rawFile, changedRaw);
    const capture = createHorizonsCapture(entry.request, changedRaw, entry.manifest.retrievedAt);
    const changed = changedManifest(manifest => { manifest.entries[1]!.manifest = clone(capture.manifest); }, rawSources);
    await expect(loadMinorBodyEphemeris(changed)).rejects.toThrow(/source manifest/);
  });

  it("rejects changed recipe, source roles, generator identity and provenance labels", async () => {
    const recipe = changedManifest(manifest => { (manifest.recipe as { degree: number }).degree += 1; });
    await expect(loadMinorBodyEphemeris(recipe)).rejects.toThrow(/source manifest/);
    const roles = changedManifest(manifest => { manifest.entries[0]!.role = "validation"; });
    await expect(loadMinorBodyEphemeris(roles)).rejects.toThrow(/source manifest/);
    const generator = changedManifest(manifest => {
      (manifest.generator as { name: string }).name = "unregistered-generator";
      manifest.generatorSha256 = sha256(JSON.stringify(manifest.generator));
    });
    await expect(loadMinorBodyEphemeris(generator)).rejects.toThrow(/source manifest/);
    const label = changedShard(shard => { shard.provenance.generator = "unregistered-generator"; });
    await expect(loadMinorBodyEphemeris(label)).rejects.toThrow(/provenance|generator/i);
  });

  it("rejects changed shard bytes, mismatched provenance, synthetic data and unsupported bodies", async () => {
    await expect(loadMinorBodyEphemeris(input({ shards: [{ text: pilot.text + " ", descriptor: pilot.descriptor }] })))
      .rejects.toThrow(/digest|byte/);
    for (const change of [
      (shard: Mutable<typeof pilot.shard>) => { shard.provenance.source = "analytic-test"; },
      (shard: Mutable<typeof pilot.shard>) => { shard.provenance.sourceManifestSha256 = "0".repeat(64); },
      (shard: Mutable<typeof pilot.shard>) => { shard.provenance.generatorSha256 = "0".repeat(64); },
      (shard: Mutable<typeof pilot.shard>) => { shard.body = "Vesta"; }
    ]) await expect(loadMinorBodyEphemeris(changedShard(change))).rejects.toThrow(/provenance|source|body/i);
  });

  it("rejects position and velocity discontinuities before exposing calculations", async () => {
    const position = changedShard(shard => { shard.segments[1]!.coefficientsAu[0][0]! += 1e-5; });
    await expect(loadMinorBodyEphemeris(position)).rejects.toThrow(/discontinuity/);
    const velocity = changedShard(shard => {
      // T0+T1 is zero at the left endpoint but has a nonzero derivative there.
      const coefficients = shard.segments[shard.segments.length - 1]!.coefficientsAu[0];
      coefficients[0]! += 1e-5;
      coefficients[1]! += 1e-5;
    });
    await expect(loadMinorBodyEphemeris(velocity)).rejects.toThrow(/discontinuity/);
  });

  it("checks cross-shard continuity, order and coverage, and supports a valid split", async () => {
    const split = (start: number, end?: number) => encodeCoefficientShard({ ...pilot.shard, segments: pilot.shard.segments.slice(start, end) });
    const first = split(0, 1);
    const second = split(1);
    const loaded = await loadMinorBodyEphemeris(input({ shards: [first, second] }));
    const seam = pilot.shard.segments[1]!.startJdTt;
    const result = loaded.calculate("Chiron", { jd: seam, scale: "tt" });
    expect(result.status).toBe("ok");
    expect(result.receipt.evaluatedShard).toEqual({ sha256: second.descriptor.sha256, segmentIndex: 0 });
    for (const shards of [[second, first], [first, split(2)], [first, first], [second]]) {
      await expect(loadMinorBodyEphemeris(input({ shards }))).rejects.toThrow(/adjacent|coverage|join/i);
    }
    const changed = clone(pilot.shard);
    changed.segments = changed.segments.slice(1);
    for (const segment of changed.segments) segment.coefficientsAu[0][0]! += 1e-5;
    await expect(loadMinorBodyEphemeris(input({ shards: [first, encodeCoefficientShard(changed)] })))
      .rejects.toThrow(/join|discontinuous/i);
  });
});

describe("local engine source identity", () => {
  it("hashes the source graph and metadata deterministically, without dist or git", async () => {
    const first = await readEngineSourceIdentity();
    const second = await readEngineSourceIdentity();
    expect(second).toEqual(first);
    const paths = first.files.map(file => file.path);
    expect(paths).toEqual([...paths].sort());
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual(expect.arrayContaining([
      "minorbodies/src/engine-bridge.ts", "src/date-input.ts", "src/time-scale.ts",
      "src/calc-frames.ts", "src/equator.ts", "src/frame.ts", "src/nutation.ts", "src/houses.ts",
      "src/deltat.ts", "src/time-scale-data.ts", "package.json"
    ]));
    expect(paths.some(path => path.startsWith("dist/") || path.startsWith(".git/"))).toBe(false);
    const { sha256: digest, ...record } = first;
    expect(digest).toBe(sha256(JSON.stringify(record)));
    for (const file of first.files) {
      expect(file.sha256).toBe(sha256(await readFile(new URL(`../../${file.path}`, import.meta.url))));
      expect(Object.isFrozen(file)).toBe(true);
    }
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.files)).toBe(true);
  });
});
