/**
 * The pack reader against values written independently of it, and the edges
 * of withEphemeris. A quantised ("q") pack is built here with a writer of the
 * format's own (two's-complement little-endian integers by BigInt, the
 * format the research runtime's compiler writes): every field width the
 * reader accepts, negative values, several records per body, Mercury stored
 * relative to the Sun, and the Earth-Moon system. The expected states are
 * the Chebyshev series of the written coefficients, evaluated here.
 */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { chart as calcChart, calc, events as calcEvents } from "./calc.js";
import { openDe440Pack, type De440Source } from "./de440.js";
import { De440Error, PackEphemeris, parsePack } from "./de440/pack.js";
import { positions, withEphemeris } from "./index.js";
import { planetaryHours, skyEvents } from "./sky.js";
import { ayanamsa, siderealChart, vargaSensitivity } from "./vedic.js";
import { birthWindow } from "./window.js";

const RADIUS = 1e9;
const NREC = 4;
const INTERVAL = (2 * RADIUS) / NREC;
const NCOEF = 3;
const FIELDS = 3 * NCOEF;
const EMRAT = 81.30056822149722;
const Q = 1e-3;
/** One width per field of a q body: every width the reader accepts, 8 being a raw float64. */
const WIDTHS = [0, 1, 2, 3, 4, 5, 8, 2, 1];
const LIMIT: Record<number, number> = { 1: 100, 2: 30_000, 3: 8_000_000, 4: 2_000_000_000, 5: 500_000_000_000 };
const NAMES = ["sun", "emb", "moon", "mercuryBary", "venusBary", "marsBary", "jupiterBary", "saturnBary", "uranusBary", "neptuneBary", "plutoBary"];

function writeInt(view: DataView, at: number, width: number, value: number): void {
  let v = BigInt(value);
  if (v < 0n) v += 1n << BigInt(8 * width);
  for (let i = 0; i < width; i += 1) {
    view.setUint8(at + i, Number(v & 0xffn));
    v >>= 8n;
  }
}

/** The coefficient written for body b, record r and field f: mid plus integer times q, with signs that vary. */
function quantum(b: number, r: number, f: number): number {
  const w = WIDTHS[f]!;
  if (w === 0 || w === 8) return 0;
  const sign = (b + r + f) % 2 === 0 ? -1 : 1;
  return sign * Math.floor(LIMIT[w]! * (0.3 + 0.17 * ((b * 7 + r * 3 + f) % 4)));
}
const mid = (b: number, f: number): number => (b + 1) * 1000 * (f % 2 === 0 ? 1 : -1) + f * 37.5;
const raw64 = (b: number, r: number, f: number): number => -12345.678 * (b + 1) + r * 0.125 - f;
function coefficient(b: number, r: number, f: number): number {
  const w = WIDTHS[f]!;
  if (w === 0) return mid(b, f);
  if (w === 8) return raw64(b, r, f);
  return mid(b, f) + quantum(b, r, f) * Q;
}

interface Options {
  readonly widths?: readonly number[];
}

function qPack(options: Options = {}): Uint8Array {
  const widths = options.widths ?? WIDTHS;
  const fieldOffset: number[] = [];
  let at = 0;
  for (const w of widths) {
    fieldOffset.push(at);
    at += w;
  }
  const stride = Math.ceil(at / 8) * 8;
  const midsBytes = FIELDS * 8;
  const bodyBytes = midsBytes + NREC * stride;
  const headerLen = 8192;
  const payloadOffset = 16 + headerLen;
  const payloadEnd = payloadOffset + NAMES.length * bodyBytes;
  const header = {
    format: "zodiacs-ephemeris-pack",
    formatVersion: 2,
    conventions: { chebyshev: "spk-type-2", units: "km,km/s" },
    coverage: { startEtSecTdb: -RADIUS, stopEtSecTdb: RADIUS },
    derived: { earth399: { emrat: EMRAT } },
    bodies: NAMES.map((name, b) => ({
      name,
      frame: name === "mercuryBary" ? "sun" : name === "sun" || name === "moon" ? "native" : "ssb",
      ncoef: NCOEF,
      nrec: NREC,
      offset: payloadOffset + b * bodyBytes,
      initEt: -RADIUS,
      intervalSec: INTERVAL,
      layout: { enc: "q", stride, midsOffset: 0, recordsOffset: midsBytes, q: Q, widths, fieldOffset }
    })),
    payloadEndOffset: payloadEnd
  };
  const bytes = new Uint8Array(payloadEnd + 32);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("ZODEPH02"), 0);
  view.setUint32(8, headerLen, true);
  view.setUint32(12, payloadOffset, true);
  bytes.fill(0x20, 16, payloadOffset);
  bytes.set(new TextEncoder().encode(JSON.stringify(header)), 16);
  NAMES.forEach((_name, b) => {
    const base = payloadOffset + b * bodyBytes;
    for (let f = 0; f < FIELDS; f += 1) view.setFloat64(base + f * 8, mid(b, f), true);
    for (let r = 0; r < NREC; r += 1) {
      const record = base + midsBytes + r * stride;
      for (let f = 0; f < FIELDS; f += 1) {
        const w = widths[f]!;
        if (w === 8) view.setFloat64(record + fieldOffset[f]!, raw64(b, r, f), true);
        else if (w > 0) writeInt(view, record + fieldOffset[f]!, w, quantum(b, r, f));
      }
    }
  });
  bytes.set(createHash("sha256").update(bytes.subarray(0, payloadEnd)).digest(), payloadEnd);
  return bytes;
}

/** The series of body b at et, evaluated here: position (km) and velocity (km/s). */
function expected(b: number, et: number): number[] {
  const r = Math.min(NREC - 1, Math.floor((et + RADIUS) / INTERVAL));
  const midEt = -RADIUS + (r + 0.5) * INTERVAL;
  const tau = (et - midEt) / (INTERVAL / 2);
  const out: number[] = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const [c0, c1, c2] = [0, 1, 2].map((k) => coefficient(b, r, axis * NCOEF + k));
    out[axis] = c0! + c1! * tau + c2! * (2 * tau * tau - 1);
    out[axis + 3] = (c1! + 4 * c2! * tau) / (INTERVAL / 2);
  }
  return out;
}

const close = (actual: ArrayLike<number>, wanted: readonly number[]) => {
  for (let i = 0; i < 6; i += 1) {
    const scale = Math.max(1, Math.abs(wanted[i]!));
    expect(Math.abs(actual[i]! - wanted[i]!) / scale, `component ${i}`).toBeLessThan(1e-12);
  }
};

const PACK = qPack();
const reader = () => new PackEphemeris(PACK, parsePack(PACK));
const INSTANTS = [-RADIUS + 1, -0.6e9, -1e8, 0, 3.3e8, 0.74e9, RADIUS - 1];

describe("the pack reader, on a quantised pack written here", () => {
  it("decodes every field width it accepts, negative values included, in the record each instant falls in", () => {
    const pack = reader();
    const out = new Float64Array(6);
    for (const et of INSTANTS) {
      for (const [b, name] of NAMES.entries()) close(pack.raw(name, et, out), expected(b, et));
    }
  });

  it("composes the Sun-relative Mercury, the Earth and the Moon from what is stored", () => {
    const pack = reader();
    const out = new Float64Array(6);
    for (const et of INSTANTS) {
      const sun = expected(0, et);
      const emb = expected(1, et);
      const moon = expected(2, et);
      close(pack.state("Mercury", et, out), expected(3, et).map((value, i) => value + sun[i]!));
      close(pack.state("Moon", et, out), emb.map((value, i) => value + moon[i]!));
      close(pack.state("Earth", et, out), emb.map((value, i) => value - moon[i]! / EMRAT));
      const [e, m, earth] = [new Float64Array(6), new Float64Array(6), new Float64Array(6)];
      pack.lunar(et, e, m, earth);
      close(earth, moon.map((value) => -value / EMRAT));
    }
  });

  it("refuses a pack with six-byte fields, which the research runtime's reader decodes wrongly", () => {
    const pack = qPack({ widths: [0, 1, 2, 3, 4, 6, 8, 2, 1] });
    expect(() => parsePack(pack)).toThrow(De440Error);
    expect(() => parsePack(pack)).toThrow(/field width 6 is not supported/u);
  });
});

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const openPack = (bytes: Uint8Array): Promise<De440Source> => openDe440Pack(bytes, { expectDigest: sha256(bytes) });

describe("withEphemeris, at its edges", () => {
  it("restores the outer source when a call with another source nests inside it", async () => {
    const outer = await openPack(PACK);
    const inner = await openPack(qPack({ widths: [0, 1, 2, 3, 4, 5, 8, 1, 2] }));
    const at = "2001-03-04T05:06:07Z";
    const outerAlone = withEphemeris(outer, () => positions(at));
    const innerAlone = withEphemeris(inner, () => positions(at));
    expect(innerAlone).not.toEqual(outerAlone);
    const nested = withEphemeris(outer, () => {
      const during = withEphemeris(inner, () => positions(at));
      return { during, after: positions(at) };
    });
    expect(nested.during).toEqual(innerAlone);
    expect(nested.after).toEqual(outerAlone);
  });

  it("refuses an iterator, whose values would be computed after the source is restored, and a source that names no ephemeris", async () => {
    const source = await openPack(PACK);
    function* lazily() {
      yield positions("2001-03-04T05:06:07Z");
    }
    expect(() => withEphemeris(source, () => lazily())).toThrow(TypeError);
    const unnamed = { place: source.place, trueNode: source.trueNode } as unknown as De440Source;
    expect(() => withEphemeris(unnamed, () => 1)).toThrow(TypeError);
  });

  it("gives longitudes in [0, 360): a source's 360 is 0 and its -0 is 0", () => {
    const edge = (lon: number) => ({
      ephemeris: { name: "edge", version: "0" },
      place: () => ({ lon, lat: 0 }),
      trueNode: () => lon
    });
    for (const lon of [360, -0]) {
      const rows = withEphemeris(edge(lon), () => positions("2001-03-04T05:06:07Z"));
      for (const row of rows.filter((r) => r.body !== "South Node")) expect(Object.is(row.lon, 0), `${lon} ${row.body}`).toBe(true);
    }
  });

  it("is refused by the entries that compute their own positions from astronomy-engine, which work as before outside it", async () => {
    const source = await openPack(PACK);
    const time = "2001-03-04T05:06:07Z";
    const calls: [string, () => unknown][] = [
      ["calc", () => calc({ body: "Moon", time })],
      ["calc, a point", () => calc({ body: "North Node", time })],
      ["calc chart", () => calcChart({ time, place: { latitude: 10, longitude: 20 } })],
      ["calc events", () => calcEvents({ kind: "longitude-crossing", body: "Sun", longitude: 0, from: time, to: "2001-04-01" })],
      ["sky", () => skyEvents("Sun", { latitude: 10, longitude: 20 }, time, "2001-03-05T05:06:07Z")],
      ["sky planetary hours", () => planetaryHours({ latitude: 10, longitude: 20 }, "2001-03-04")],
      ["vedic star-anchored ayanamsa", () => ayanamsa("true-chitra", time)],
      ["vedic sidereal chart on a star-anchored ayanamsa", () => siderealChart({ utc: time, latitude: 10, longitude: 20 }, "true-chitra")],
      ["window", () => birthWindow({ start: new Date(time), end: new Date(Date.parse(time) + 600_000), latitude: 10, longitude: 20 })],
      ["vedic varga timing", () => vargaSensitivity({ utc: time, latitude: 10, longitude: 20 }, "lahiri", { points: ["Moon"], horizonMinutes: 20 })]
    ];
    for (const [name, call] of calls) {
      expect(() => withEphemeris(source, call), name).toThrow(/does not run inside withEphemeris/u);
      expect(call, name).not.toThrow();
    }
    // A tropical-anchored ayanamsa needs no star place, and runs inside.
    expect(() => withEphemeris(source, () => siderealChart({ utc: time, latitude: 10, longitude: 20 }, "lahiri"))).not.toThrow();
  });

  it("refuses an asynchronous function without leaving its rejection unhandled", async () => {
    const source = await openPack(PACK);
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      expect(() => withEphemeris(source, async () => { throw new Error("later"); })).toThrow(TypeError);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("asks for WebCrypto with a TypeError when there is none", async () => {
    vi.stubGlobal("crypto", undefined);
    try {
      await expect(openPack(PACK)).rejects.toThrow(TypeError);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
