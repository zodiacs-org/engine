/**
 * `@zodiacs/engine/de440` without DE440 data (tier A): a synthetic sealed
 * pack built here, straight-line motions about J2000 in one record per body,
 * so the reader, the digest checks, the reduction's plumbing, the switch in
 * the engine (`withEphemeris`) and the DE440 receipts can be tested
 * anywhere. Accuracy against DE440 is tier B (`src/de440-kernel.test.ts`).
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { De440Error, openDe440Pack } from "./de440.js";
import type { De440Source } from "./de440.js";
import { moonPhase, natalChart, positions, withEphemeris } from "./index.js";
import { NATAL_RECEIPT_CONVENTION_SETS, createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "./receipt.js";
import { normalizeLongitude } from "./signs.js";
import { timeBasis } from "./time-scale.js";

const AU = 149597870.7;
const RADIUS = 1e9;
/** name, frame, position (km) at J2000, velocity (km/s). */
const BODIES: [string, string, [number, number, number], [number, number, number]][] = [
  ["sun", "native", [0, 0, 0], [0, 0, 0]],
  ["emb", "ssb", [AU, 0, 0], [0, 29.78, 0]],
  ["moon", "native", [384400, 0, 20000], [0, 1.02, 0.05]],
  ["mercuryBary", "ssb", [-0.39 * AU, 0.1 * AU, 0], [0, -47.4, 0]],
  ["venusBary", "ssb", [0, 0.72 * AU, 0], [-35.0, 0, 0]],
  ["marsBary", "ssb", [-1.52 * AU, 0, 0.02 * AU], [0, -24.1, 0]],
  ["jupiterBary", "ssb", [0, -5.2 * AU, 0], [13.1, 0, 0]],
  ["saturnBary", "ssb", [9.5 * AU, 1 * AU, 0], [0, 9.7, 0]],
  ["uranusBary", "ssb", [-19.2 * AU, 0, 0], [0, -6.8, 0]],
  ["neptuneBary", "ssb", [0, 30.1 * AU, 0.5 * AU], [-5.4, 0, 0]],
  ["plutoBary", "ssb", [20 * AU, -30 * AU, 5 * AU], [3, 2, -1]]
];

/** A sealed ZODEPH02 pack: a 4096-byte header, one two-coefficient float64 record per body, the SHA-256 trailer. */
function syntheticPack(): Uint8Array {
  const headerLen = 4096;
  const payloadOffset = 16 + headerLen;
  const stride = 3 * 2 * 8;
  const payloadEnd = payloadOffset + BODIES.length * stride;
  const header = {
    format: "zodiacs-ephemeris-pack",
    formatVersion: 2,
    compiler: { name: "synthetic test pack", version: "0.0.0" },
    conventions: { chebyshev: "spk-type-2", units: "km,km/s" },
    coverage: { startEtSecTdb: -RADIUS, stopEtSecTdb: RADIUS },
    derived: { earth399: { emrat: 81.30056822149722 } },
    bodies: BODIES.map(([name, frame], i) => ({
      name,
      frame,
      ncoef: 2,
      nrec: 1,
      offset: payloadOffset + i * stride,
      initEt: -RADIUS,
      intervalSec: 2 * RADIUS,
      layout: { enc: "f64", stride, midsOffset: 0, recordsOffset: 0 }
    })),
    payloadEndOffset: payloadEnd
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  if (json.length > headerLen) throw new Error("synthetic header too long");
  const bytes = new Uint8Array(payloadEnd + 32);
  bytes.set(new TextEncoder().encode("ZODEPH02"), 0);
  const dv = new DataView(bytes.buffer);
  dv.setUint32(8, headerLen, true);
  dv.setUint32(12, payloadOffset, true);
  bytes.fill(0x20, 16, payloadOffset);
  bytes.set(json, 16);
  BODIES.forEach(([, , p, v], i) => {
    const base = payloadOffset + i * stride;
    for (let axis = 0; axis < 3; axis += 1) {
      // p(tau) = c0 + c1 tau: c0 the position at J2000 (tau = 0), c1 = v * radius.
      dv.setFloat64(base + axis * 16, p[axis]!, true);
      dv.setFloat64(base + axis * 16 + 8, v[axis]! * RADIUS, true);
    }
  });
  bytes.set(createHash("sha256").update(bytes.subarray(0, payloadEnd)).digest(), payloadEnd);
  return bytes;
}

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const PACK = syntheticPack();
const DIGEST = sha256(PACK);
const open = (): Promise<De440Source> => openDe440Pack(PACK, { expectDigest: DIGEST });

async function refusal(bytes: Uint8Array, digest: string): Promise<string> {
  try {
    await openDe440Pack(bytes, { expectDigest: digest });
  } catch (error) {
    if (error instanceof De440Error) return error.code;
    throw error;
  }
  return "opened";
}

describe("openDe440Pack", () => {
  it("opens a sealed pack with the SHA-256 it is given, and says what it opened", async () => {
    const source = await open();
    expect(source.ephemeris).toEqual({ name: "jpl-de440", version: DIGEST });
    expect(source.pack).toEqual({
      sha256: DIGEST,
      bytes: PACK.byteLength,
      startEtSecTdb: -RADIUS,
      stopEtSecTdb: RADIUS,
      compiler: { name: "synthetic test pack", version: "0.0.0" }
    });
  });

  it("refuses a pack one byte different from the digest it expects (C2), and the unmodified pack opens", async () => {
    const changed = PACK.slice();
    changed[PACK.byteLength - 100] = changed[PACK.byteLength - 100]! ^ 1;
    expect(await refusal(changed, DIGEST)).toBe("digest-mismatch");
    expect(await refusal(PACK, DIGEST)).toBe("opened");
  });

  it("refuses a pack whose own trailer does not match its contents, even when its file digest was expected", async () => {
    const changed = PACK.slice();
    changed[PACK.byteLength - 100] = changed[PACK.byteLength - 100]! ^ 1;
    expect(await refusal(changed, sha256(changed))).toBe("digest-mismatch");
  });

  it("refuses bytes that are not a sealed pack", async () => {
    const other = new TextEncoder().encode("not an ephemeris pack at all, but long enough to be read".repeat(4));
    expect(await refusal(other, sha256(other))).toBe("not-a-pack");
  });

  it("refuses a digest that is not 64 lower-case hexadecimal digits, and bytes that are not a Uint8Array", async () => {
    await expect(openDe440Pack(PACK, { expectDigest: DIGEST.toUpperCase() })).rejects.toThrow(TypeError);
    await expect(openDe440Pack([1, 2, 3] as unknown as Uint8Array, { expectDigest: DIGEST })).rejects.toThrow(TypeError);
  });

  it("keeps its own copy of the bytes", async () => {
    const bytes = PACK.slice();
    const source = await openDe440Pack(bytes, { expectDigest: DIGEST });
    const before = source.place("Mars", 1);
    bytes.fill(0);
    expect(source.place("Mars", 1)).toEqual(before);
  });
});

describe("a DE440 source", () => {
  it("places every body and the true node at finite longitudes in [0, 360)", async () => {
    const source = await open();
    for (const body of ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"] as const) {
      const place = source.place(body, 3.25);
      expect(place.lon).toBeGreaterThanOrEqual(0);
      expect(place.lon).toBeLessThan(360);
      expect(Number.isFinite(place.lat)).toBe(true);
    }
    const node = source.trueNode(3.25);
    expect(node).toBeGreaterThanOrEqual(0);
    expect(node).toBeLessThan(360);
  });

  it("refuses an instant outside its pack", async () => {
    const source = await open();
    expect(() => source.place("Sun", 20000)).toThrow(De440Error);
    expect(() => source.trueNode(-20000)).toThrow(De440Error);
  });
});

describe("withEphemeris", () => {
  const instant = "2000-01-02T03:04:05Z";
  const ttDays = timeBasis(Date.parse(instant)).ttDays;

  it("takes every body of positions() from the source, and astronomy-engine's again afterwards", async () => {
    const source = await open();
    const outside = positions(instant);
    const inside = withEphemeris(source, () => positions(instant));
    for (const row of inside) {
      if (row.body === "North Node") expect(row.lon).toBe(source.trueNode(ttDays));
      else if (row.body === "South Node") expect(row.lon).toBe(normalizeLongitude(source.trueNode(ttDays) + 180));
      else expect([row.lon, row.lat]).toEqual([source.place(row.body, ttDays).lon, source.place(row.body, ttDays).lat]);
    }
    expect(inside.map((row) => row.body)).toEqual(outside.map((row) => row.body));
    expect(inside[0]!.lon).not.toBe(outside[0]!.lon);
    expect(positions(instant)).toEqual(outside);
  });

  it("names the source in a chart computed inside it, and nothing outside it", async () => {
    const source = await open();
    const birth = { utc: instant, latitude: 10, longitude: 20 };
    expect(withEphemeris(source, () => natalChart(birth)).ephemeris).toEqual({ name: "jpl-de440", version: DIGEST });
    expect(Object.hasOwn(natalChart(birth), "ephemeris")).toBe(false);
  });

  it("gives moonPhase the source's Sun and Moon", async () => {
    const source = await open();
    const phase = withEphemeris(source, () => moonPhase(instant));
    const expected = (source.place("Moon", ttDays).lon - source.place("Sun", ttDays).lon + 360) % 360;
    expect(phase.angle).toBeCloseTo(expected, 12);
  });

  it("restores the previous source when its function throws, and nests", async () => {
    const source = await open();
    const outside = positions(instant);
    expect(() =>
      withEphemeris(source, () => {
        throw new Error("inside");
      })
    ).toThrow("inside");
    expect(positions(instant)).toEqual(outside);
    const nested = withEphemeris(source, () => withEphemeris(source, () => positions(instant)));
    expect(nested).toEqual(withEphemeris(source, () => positions(instant)));
  });

  it("refuses a function that returns a promise, with the source already restored", async () => {
    const source = await open();
    const outside = positions(instant);
    expect(() => withEphemeris(source, async () => positions(instant))).toThrow(TypeError);
    expect(positions(instant)).toEqual(outside);
  });

  it("refuses something that is not a source", () => {
    expect(() => withEphemeris({} as never, () => 1)).toThrow(TypeError);
  });

  it("keeps interleaved calls with different sources apart (C12)", async () => {
    const source = await open();
    const results: unknown[] = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(i % 2 ? positions(instant) : withEphemeris(source, () => positions(instant)));
    }
    expect(results[0]).toEqual(results[2]);
    expect(results[1]).toEqual(results[3]);
    expect(results[0]).not.toEqual(results[1]);
  });
});

describe("a DE440 chart's receipt", () => {
  const birth = { utc: "2000-01-02T03:04:05Z", latitude: 10, longitude: 20 };

  it("names the pack and the DE440 conventions, requires the DE440 feature, and reads back", async () => {
    const source = await open();
    const envelope = createNatalEnvelope(withEphemeris(source, () => natalChart(birth)));
    expect(envelope.requiredFeatures).toEqual(["convention-ids", "ephemeris-jpl-de440"]);
    expect(envelope.receipt.engine.ephemeris).toEqual({ name: "jpl-de440", version: DIGEST });
    expect(envelope.receipt.conventions).toEqual(NATAL_RECEIPT_CONVENTION_SETS[NATAL_RECEIPT_CONVENTION_SETS.length - 1]);
    expect(envelope.receipt.conventionIds).toContain(`ephemeris:jpl-de440@${DIGEST}`);
    const parsed = parseNatalEnvelope(serializeNatalEnvelope(envelope));
    expect(parsed.ok).toBe(true);
  });

  it("is refused without the DE440 feature, with astronomy-engine's set, or with another ephemeris name", async () => {
    const source = await open();
    const json = serializeNatalEnvelope(createNatalEnvelope(withEphemeris(source, () => natalChart(birth))));
    const edited = (edit: (envelope: Record<string, any>) => void): boolean => {
      const copy = JSON.parse(json);
      edit(copy);
      return parseNatalEnvelope(JSON.stringify(copy)).ok;
    };
    expect(edited(() => {})).toBe(true);
    expect(edited((e) => (e.requiredFeatures = ["convention-ids"]))).toBe(false);
    expect(edited((e) => (e.receipt.conventions = { ...NATAL_RECEIPT_CONVENTION_SETS[0] }))).toBe(false);
    expect(edited((e) => (e.receipt.engine.ephemeris.name = "astronomy-engine"))).toBe(false);
    expect(edited((e) => (e.receipt.engine.ephemeris.version = "2.1.19"))).toBe(false);
  });

  it("is unchanged for a chart from astronomy-engine", () => {
    const envelope = createNatalEnvelope(natalChart(birth));
    expect(envelope.requiredFeatures).toEqual(["convention-ids"]);
    expect(envelope.receipt.engine.ephemeris).toEqual({ name: "astronomy-engine", version: "2.1.19" });
    expect(envelope.receipt.conventions).toEqual(NATAL_RECEIPT_CONVENTION_SETS[0]);
  });
});
