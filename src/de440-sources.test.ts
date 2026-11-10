/**
 * Check C8 (a) of P4.1's preregistration: with a DE440 source selected, no
 * call the hosted compute API makes reaches astronomy-engine's position
 * functions, counted by a spy on them; and with astronomy-engine selected the
 * spy counts calls, so the count has teeth. The source here is the synthetic
 * pack of src/de440.test.ts's kind.
 */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const counted = vi.hoisted(() => ({ calls: 0 }));
vi.mock("astronomy-engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("astronomy-engine")>();
  const spy =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      counted.calls += 1;
      return fn(...args);
    };
  return {
    ...original,
    GeoVector: spy(original.GeoVector),
    GeoMoon: spy(original.GeoMoon),
    GeoMoonState: spy(original.GeoMoonState),
    HelioVector: spy(original.HelioVector),
    BaryState: spy(original.BaryState),
    Ecliptic: spy(original.Ecliptic),
    EclipticGeoMoon: spy(original.EclipticGeoMoon),
    SunPosition: spy(original.SunPosition)
  };
});

const { openDe440Pack } = await import("./de440.js");
const engine = await import("./index.js");

const AU = 149597870.7;
const RADIUS = 1e9;
function syntheticPack(): Uint8Array {
  const bodies: [string, string, number[], number[]][] = [
    ["sun", "native", [0, 0, 0], [0, 0, 0]],
    ["emb", "ssb", [AU, 0, 0], [0, 29.78, 0]],
    ["moon", "native", [384400, 0, 20000], [0, 1.02, 0.05]],
    ["mercuryBary", "ssb", [-0.39 * AU, 0.1 * AU, 0], [0, -47.4, 0]],
    ["venusBary", "ssb", [0, 0.72 * AU, 0], [-35, 0, 0]],
    ["marsBary", "ssb", [-1.52 * AU, 0, 0.02 * AU], [0, -24.1, 0]],
    ["jupiterBary", "ssb", [0, -5.2 * AU, 0], [13.1, 0, 0]],
    ["saturnBary", "ssb", [9.5 * AU, AU, 0], [0, 9.7, 0]],
    ["uranusBary", "ssb", [-19.2 * AU, 0, 0], [0, -6.8, 0]],
    ["neptuneBary", "ssb", [0, 30.1 * AU, 0.5 * AU], [-5.4, 0, 0]],
    ["plutoBary", "ssb", [20 * AU, -30 * AU, 5 * AU], [3, 2, -1]]
  ];
  const headerLen = 4096;
  const payloadOffset = 16 + headerLen;
  const stride = 48;
  const payloadEnd = payloadOffset + bodies.length * stride;
  const header = {
    format: "zodiacs-ephemeris-pack",
    formatVersion: 2,
    conventions: { chebyshev: "spk-type-2", units: "km,km/s" },
    coverage: { startEtSecTdb: -RADIUS, stopEtSecTdb: RADIUS },
    derived: { earth399: { emrat: 81.30056822149722 } },
    bodies: bodies.map(([name, frame], i) => ({
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
  const bytes = new Uint8Array(payloadEnd + 32);
  const dv = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("ZODEPH02"), 0);
  dv.setUint32(8, headerLen, true);
  dv.setUint32(12, payloadOffset, true);
  bytes.fill(0x20, 16, payloadOffset);
  bytes.set(new TextEncoder().encode(JSON.stringify(header)), 16);
  bodies.forEach(([, , p, v], i) => {
    for (let axis = 0; axis < 3; axis += 1) {
      dv.setFloat64(payloadOffset + i * stride + axis * 16, p[axis]!, true);
      dv.setFloat64(payloadOffset + i * stride + axis * 16 + 8, v[axis]! * RADIUS, true);
    }
  });
  bytes.set(createHash("sha256").update(bytes.subarray(0, payloadEnd)).digest(), payloadEnd);
  return bytes;
}

const PACK = syntheticPack();
const source = await openDe440Pack(PACK, { expectDigest: createHash("sha256").update(PACK).digest("hex") });
const instant = "2000-01-02T03:04:05Z";
const later = "2000-01-20T00:00:00Z";

/** Every call the compute API makes that gives or uses a body's position. */
const calls: [string, () => unknown][] = [
  ["natalChart", () => engine.natalChart({ utc: instant, latitude: 10, longitude: 20, houseSystem: "placidus" })],
  ["natalChart without a time", () => engine.natalChart({ utc: instant, timeKnown: false })],
  ["positions", () => engine.positions(instant)],
  ["moonPhase", () => engine.moonPhase(instant)],
  ["searchLongitudeCrossings (an ingress)", () => engine.searchLongitudeCrossings("Sun", 280, new Date(instant), new Date(later))],
  [
    "searchLongitudeCrossingsWith (a station's speed)",
    () => engine.searchLongitudeCrossingsWith((body, date) => engine.positions(date).find((row) => row.body === body)!.speed, "Mercury", 0, new Date(instant), new Date(later))
  ],
  [
    "searchLongitudeCrossingsWith (a lunation's elongation)",
    () => engine.searchLongitudeCrossingsWith((_body, date) => engine.moonPhase(date).angle, "Moon", 0, new Date(instant), new Date(later))
  ],
  [
    "separation, matchAspect and aspectMotion on positions",
    () => {
      const rows = engine.positions(instant);
      const sun = rows.find((row) => row.body === "Sun")!;
      const moon = rows.find((row) => row.body === "Moon")!;
      return [engine.separation(sun.lon, moon.lon), engine.matchAspect("Sun", sun.lon, "Moon", moon.lon), engine.aspectMotion(sun, moon, 90)];
    }
  ]
];

describe("C8 (a): the DE440 source keeps astronomy-engine's position functions out of every call", () => {
  it.each(calls)("%s: none with the DE440 source, some with astronomy-engine", (_name, call) => {
    counted.calls = 0;
    engine.withEphemeris(source, call);
    expect(counted.calls).toBe(0);
    counted.calls = 0;
    call();
    expect(counted.calls).toBeGreaterThan(0);
  });
});
