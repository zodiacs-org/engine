/**
 * The sealed pack's prologue and header checks (`parsePack`), one refusal at
 * a time. A pack's bytes come from the caller, so every check that guards a
 * read or an allocation is exercised here with a header that breaks it and
 * nothing else: each case starts from a pack that parses, changes one field,
 * and expects the refusal's code and the field it names. The pack is a
 * synthetic float64 pack written here (the layout of `src/de440.test.ts`);
 * no DE440 data is involved.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openDe440Pack } from "./de440.js";
import { De440Error, PackEphemeris, parsePack, type De440ErrorCode } from "./de440/pack.js";

const RADIUS = 1e9;
const NAMES = ["sun", "emb", "moon", "mercuryBary", "venusBary", "marsBary", "jupiterBary", "saturnBary", "uranusBary", "neptuneBary", "plutoBary"];
const NCOEF = 2;
const STRIDE = 3 * NCOEF * 8;
const HEADER_LEN = 8192;
const PAYLOAD_OFFSET = 16 + HEADER_LEN;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

function baseHeader(names: readonly string[] = NAMES): Json {
  return {
    format: "zodiacs-ephemeris-pack",
    formatVersion: 2,
    compiler: { name: "synthetic header test pack", version: "0.0.0" },
    conventions: { chebyshev: "spk-type-2", units: "km,km/s" },
    coverage: { startEtSecTdb: -RADIUS, stopEtSecTdb: RADIUS },
    derived: { earth399: { emrat: 81.30056822149722 } },
    bodies: names.map((name, i) => ({
      name,
      frame: name === "sun" || name === "moon" ? "native" : "ssb",
      ncoef: NCOEF,
      nrec: 1,
      offset: PAYLOAD_OFFSET + i * STRIDE,
      initEt: -RADIUS,
      intervalSec: 2 * RADIUS,
      layout: { enc: "f64", stride: STRIDE, midsOffset: 0, recordsOffset: 0 }
    })),
    payloadEndOffset: PAYLOAD_OFFSET + names.length * STRIDE
  };
}

interface Frame {
  /** Header bytes as written; a header object is serialised as JSON. */
  readonly header?: Json | string;
  readonly headerLen?: number;
  readonly payloadOffset?: number;
  /** Payload bytes after the header region (default: the declared payloadEndOffset). */
  readonly payloadEnd?: number;
  readonly magic?: string;
}

/**
 * A sealed pack: magic, header length and payload offset, the header padded
 * with spaces, a payload of small constant coefficients and the SHA-256
 * trailer over everything before it.
 */
function pack(frame: Frame = {}): Uint8Array {
  const header = frame.header ?? baseHeader();
  const headerLen = frame.headerLen ?? HEADER_LEN;
  const payloadOffset = frame.payloadOffset ?? PAYLOAD_OFFSET;
  const text = typeof header === "string" ? header : JSON.stringify(header);
  const json = new TextEncoder().encode(text);
  let declared: unknown;
  try {
    declared = (JSON.parse(text) as Json | null)?.payloadEndOffset;
  } catch {
    declared = undefined;
  }
  // The file is never shorter than the base pack's prologue and header region, so a
  // header field that is wrong on purpose is what the parser meets first.
  const declaredEnd = Number.isSafeInteger(declared) ? (declared as number) : 0;
  const payloadEnd = Math.max(frame.payloadEnd ?? declaredEnd, PAYLOAD_OFFSET, 16 + json.length);
  const bytes = new Uint8Array(payloadEnd + 32);
  bytes.set(new TextEncoder().encode(frame.magic ?? "ZODEPH02"), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, headerLen, true);
  view.setUint32(12, payloadOffset, true);
  bytes.fill(0x20, 16, Math.min(16 + headerLen, payloadEnd));
  bytes.set(json, 16);
  for (let at = PAYLOAD_OFFSET; at + 8 <= payloadEnd; at += 8) view.setFloat64(at, 1000, true);
  bytes.set(createHash("sha256").update(bytes.subarray(0, payloadEnd)).digest(), payloadEnd);
  return bytes;
}

/** The base header with one change applied. */
function edited(change: (header: Json) => void, names?: readonly string[]): Uint8Array {
  const header = baseHeader(names);
  change(header);
  return pack({ header });
}

function refusal(bytes: Uint8Array): { code: De440ErrorCode; message: string } | "parsed" {
  try {
    parsePack(bytes);
  } catch (error) {
    if (error instanceof De440Error) return { code: error.code, message: error.message };
    throw error;
  }
  return "parsed";
}

function expectRefusal(bytes: Uint8Array, code: De440ErrorCode, message: RegExp): void {
  const result = refusal(bytes);
  expect(result, "the pack was parsed").not.toBe("parsed");
  if (result === "parsed") return;
  expect(result.code).toBe(code);
  expect(result.message).toMatch(message);
}

const body = (header: Json, name = "marsBary"): Json => header.bodies.find((b: Json) => b.name === name);

describe("parsePack, on the synthetic pack every case starts from", () => {
  it("parses it, so each refusal below is caused by the one field it changes", () => {
    const parsed = parsePack(pack());
    expect(parsed.bodies.map((b) => b.name)).toEqual(NAMES);
    expect(parsed.coverage).toEqual({ startEtSecTdb: -RADIUS, stopEtSecTdb: RADIUS });
    expect(parsed.payloadEnd).toBe(PAYLOAD_OFFSET + NAMES.length * STRIDE);
    expect(parsed.digestRegionEnd).toBe(parsed.payloadEnd);
  });
});

describe("parsePack refuses a prologue that cannot frame a header", () => {
  it("refuses more than 256 MiB before reading a byte of it", () => {
    // A stand-in with only a length: the size check must come before any read.
    const huge = { byteLength: 268_435_457 } as unknown as Uint8Array;
    expectRefusal(huge, "too-large", /268435457 bytes; the limit is 268435456/u);
  });

  it("refuses fewer bytes than a prologue, a trailer and a two-byte header", () => {
    expectRefusal(new Uint8Array(49), "truncated", /49 bytes, too short/u);
    // Fifty bytes pass the size check and fail on what they hold.
    const fifty = new Uint8Array(50);
    fifty.set(new TextEncoder().encode("ZODEPH02"), 0);
    expectRefusal(fifty, "bad-header", /header length 0/u);
  });

  it("refuses another magic, the version-1 magic included, as not a pack", () => {
    expectRefusal(pack({ magic: "ZODEPH01" }), "not-a-pack", /ZODEPH02/u);
    expectRefusal(pack({ magic: "zodeph02" }), "not-a-pack", /ZODEPH02/u);
  });

  it("refuses a header length of zero or above 4 MiB", () => {
    expectRefusal(pack({ headerLen: 0 }), "bad-header", /header length 0 is outside 1\.\.4194304/u);
    expectRefusal(pack({ headerLen: 4_194_305 }), "bad-header", /header length 4194305/u);
  });

  it("refuses a header length that runs past the end of the file", () => {
    const bytes = pack();
    expectRefusal(pack({ headerLen: bytes.byteLength }), "truncated", /header claims/u);
  });

  it("refuses a payload offset inside the header or past the end of the file", () => {
    expectRefusal(pack({ payloadOffset: 16 + HEADER_LEN - 1 }), "bad-header", /payload offset .* not inside the file after the header/u);
    expectRefusal(pack({ payloadOffset: 0xffff_ffff }), "bad-header", /payload offset 4294967295/u);
  });
});

describe("parsePack refuses a header that is not the pack format", () => {
  it("refuses text that is not JSON, and JSON that is not an object", () => {
    expectRefusal(pack({ header: "{ not json" }), "bad-header", /not valid JSON/u);
    expectRefusal(pack({ header: "null" }), "bad-header", /not an object/u);
    expectRefusal(pack({ header: "42" }), "bad-header", /not an object/u);
  });

  it("refuses a payload end that is missing, fractional or negative, and one that runs into the trailer", () => {
    expectRefusal(edited((h) => delete h.payloadEndOffset), "bad-header", /payloadEndOffset/u);
    expectRefusal(edited((h) => (h.payloadEndOffset = 100.5)), "bad-header", /payloadEndOffset/u);
    expectRefusal(edited((h) => (h.payloadEndOffset = -1)), "bad-header", /payloadEndOffset/u);
    const header = baseHeader();
    const tooFar = header.payloadEndOffset + 1;
    header.payloadEndOffset = tooFar;
    expectRefusal(pack({ header, payloadEnd: tooFar - 1 }), "truncated", /precede the digest trailer/u);
  });

  it("refuses another format name, and any formatVersion but the number 2", () => {
    expectRefusal(edited((h) => (h.format = "zodiacs-ephemeris")), "bad-header", /format is not zodiacs-ephemeris-pack/u);
    expectRefusal(edited((h) => (h.formatVersion = 1)), "unsupported-version", /formatVersion 1 is not 2/u);
    expectRefusal(edited((h) => (h.formatVersion = 3)), "unsupported-version", /formatVersion 3/u);
    expectRefusal(edited((h) => (h.formatVersion = "2")), "unsupported-version", /formatVersion "2"/u);
  });

  it("refuses a pack that does not declare SPK type-2 series in km and km/s", () => {
    const message = /SPK type-2 Chebyshev series in km and km\/s/u;
    expectRefusal(edited((h) => delete h.conventions), "bad-header", message);
    expectRefusal(edited((h) => (h.conventions.chebyshev = "spk-type-3")), "bad-header", message);
    expectRefusal(edited((h) => (h.conventions.units = "au,au/d")), "bad-header", message);
  });

  it("refuses coverage that is missing, not a number, not finite, empty or reversed", () => {
    const message = /coverage is missing, not finite or not increasing/u;
    expectRefusal(edited((h) => delete h.coverage), "bad-header", message);
    expectRefusal(edited((h) => (h.coverage.startEtSecTdb = "-1e9")), "bad-header", message);
    // JSON reads 1e400 as Infinity.
    expectRefusal(pack({ header: JSON.stringify(baseHeader()).replace(`"stopEtSecTdb":${RADIUS}`, '"stopEtSecTdb":1e400') }), "bad-header", message);
    expectRefusal(edited((h) => (h.coverage.stopEtSecTdb = -RADIUS)), "bad-header", message);
    expectRefusal(edited((h) => (h.coverage.stopEtSecTdb = -2 * RADIUS)), "bad-header", message);
  });

  it("refuses an Earth/Moon mass ratio outside 80..83, and accepts both ends", () => {
    const message = /no plausible Earth\/Moon mass ratio/u;
    expectRefusal(edited((h) => delete h.derived), "bad-header", message);
    expectRefusal(edited((h) => (h.derived.earth399.emrat = "81.3")), "bad-header", message);
    expectRefusal(edited((h) => (h.derived.earth399.emrat = 79.999)), "bad-header", message);
    expectRefusal(edited((h) => (h.derived.earth399.emrat = 83.001)), "bad-header", message);
    expect(parsePack(edited((h) => (h.derived.earth399.emrat = 80))).emrat).toBe(80);
    expect(parsePack(edited((h) => (h.derived.earth399.emrat = 83))).emrat).toBe(83);
  });
});

describe("parsePack refuses a body list it cannot read safely", () => {
  it("refuses no bodies, a body list that is not a list, and more than 64 bodies", () => {
    expectRefusal(edited((h) => (h.bodies = [])), "bad-header", /declares no bodies/u);
    expectRefusal(edited((h) => (h.bodies = { sun: {} })), "bad-header", /declares no bodies/u);
    // The count is checked before any body is read, so 65 bare names are enough.
    expectRefusal(edited((h) => (h.bodies = Array.from({ length: 65 }, (_, i) => ({ name: `b${i}` })))), "bad-header", /65 bodies; the limit is 64/u);
  });

  it("refuses a body without a usable name, and a name declared twice", () => {
    const message = /a body has no usable name/u;
    expectRefusal(edited((h) => (h.bodies[3] = null)), "bad-header", message);
    expectRefusal(edited((h) => (h.bodies[3].name = "")), "bad-header", message);
    expectRefusal(edited((h) => (h.bodies[3].name = 7)), "bad-header", message);
    expectRefusal(edited((h) => (h.bodies[3].name = "x".repeat(65))), "bad-header", message);
    expectRefusal(edited((h) => (h.bodies[4].name = "mercuryBary")), "bad-header", /mercuryBary is declared twice/u);
  });

  it("refuses counts and offsets that are not safe non-negative integers", () => {
    for (const key of ["ncoef", "nrec", "offset"]) {
      for (const value of [-1, 2.5, "2", null, 2 ** 53]) {
        expectRefusal(edited((h) => (body(h)[key] = value)), "bad-header", new RegExp(`marsBary: ${key} is not a safe non-negative integer`, "u"));
      }
    }
  });

  it("refuses fewer than 2 or more than 512 coefficients, and fewer than 1 or more than 20,000,000 records", () => {
    expectRefusal(edited((h) => (body(h).ncoef = 1)), "bad-header", /ncoef 1 is out of range/u);
    expectRefusal(edited((h) => (body(h).ncoef = 513)), "bad-header", /ncoef 513 is out of range/u);
    expectRefusal(edited((h) => (body(h).nrec = 0)), "bad-header", /nrec 0 is out of range/u);
    expectRefusal(edited((h) => (body(h).nrec = 20_000_001)), "bad-header", /nrec 20000001 is out of range/u);
  });

  it("refuses a start that is not finite, and a record interval outside 1 s..4000 Julian years", () => {
    expectRefusal(edited((h) => delete body(h).initEt), "bad-header", /initEt is not finite/u);
    expectRefusal(edited((h) => (body(h).initEt = "-1e9")), "bad-header", /initEt is not finite/u);
    expectRefusal(edited((h) => (body(h).intervalSec = 0.5)), "bad-header", /intervalSec 0.5 is out of range/u);
    expectRefusal(edited((h) => (body(h).intervalSec = 126_230_400_001)), "bad-header", /intervalSec 126230400001 is out of range/u);
    expectRefusal(edited((h) => delete body(h).intervalSec), "bad-header", /intervalSec undefined is out of range/u);
  });

  it("refuses a frame other than ssb, sun or native", () => {
    expectRefusal(edited((h) => (body(h).frame = "earth")), "bad-header", /frame "earth" is not supported/u);
    expectRefusal(edited((h) => delete body(h).frame), "bad-header", /frame undefined is not supported/u);
  });

  it("refuses a missing layout, an unknown encoding, and layout offsets that are not safe counts", () => {
    expectRefusal(edited((h) => delete body(h).layout), "bad-header", /marsBary: no layout/u);
    expectRefusal(edited((h) => (body(h).layout = "f64")), "bad-header", /marsBary: no layout/u);
    expectRefusal(edited((h) => (body(h).layout.enc = "f32")), "bad-header", /encoding is not supported/u);
    for (const key of ["stride", "midsOffset", "recordsOffset"]) {
      expectRefusal(edited((h) => (body(h).layout[key] = -8)), "bad-header", new RegExp(`layout\\.${key} is not a safe`, "u"));
    }
    expectRefusal(edited((h) => (body(h).layout.stride = 0)), "bad-header", /layout\.stride is zero/u);
  });

  it("refuses a float64 record wider than its stride", () => {
    expectRefusal(edited((h) => (body(h).layout.stride = STRIDE - 8)), "bad-geometry", /float64 record does not fit the stride/u);
  });

  it("refuses an extent whose product or sum leaves the exact integer range, before allocating anything", () => {
    // nrec * stride overflows 2^53.
    expectRefusal(
      edited((h) => {
        body(h).nrec = 20_000_000;
        body(h).layout.stride = 2 ** 52;
      }),
      "bad-header",
      /marsBary records: extent overflows exact integer range/u
    );
    // nrec * stride is exact; adding the records offset is not.
    expectRefusal(
      edited((h) => {
        body(h).layout.stride = Number.MAX_SAFE_INTEGER;
        body(h).layout.recordsOffset = 1;
      }),
      "bad-header",
      /marsBary records: extent overflows exact integer range/u
    );
  });

  it("refuses a body that starts before the payload, or runs past its declared end", () => {
    expectRefusal(edited((h) => (body(h).offset = PAYLOAD_OFFSET - 1)), "bad-geometry", /marsBary starts before the payload/u);
    expectRefusal(edited((h) => (body(h, "plutoBary").offset += 8)), "truncated", /plutoBary runs past the payload/u);
  });

  it("refuses records that do not span the coverage, with one second of slack at either end", () => {
    const message = /marsBary does not span the pack's coverage/u;
    expectRefusal(edited((h) => (body(h).initEt = -RADIUS + 2)), "bad-geometry", message);
    expectRefusal(edited((h) => (body(h).intervalSec = 2 * RADIUS - 2)), "bad-geometry", message);
    expect(refusal(edited((h) => (body(h).initEt = -RADIUS + 1)))).toBe("parsed");
    expect(refusal(edited((h) => (body(h).intervalSec = 2 * RADIUS - 1)))).toBe("parsed");
  });

  it("refuses two bodies whose bytes overlap", () => {
    expectRefusal(edited((h) => (body(h).offset = body(h, "venusBary").offset + 8)), "bad-geometry", /overlap/u);
  });
});

describe("parsePack refuses a quantised layout it cannot decode", () => {
  /** marsBary rewritten as a q body: mids then one record of 2-byte fields. */
  function quantised(change: (layout: Json) => void = () => undefined): Uint8Array {
    return edited((h) => {
      const fields = 3 * NCOEF;
      const mars = body(h);
      mars.layout = {
        enc: "q",
        stride: 2 * fields,
        midsOffset: 0,
        recordsOffset: 8 * fields,
        q: 1e-3,
        widths: Array(fields).fill(2),
        fieldOffset: Array.from({ length: fields }, (_, f) => 2 * f)
      };
      change(mars.layout);
      // The mids and the record need 60 bytes, more than the f64 body's 48, so marsBary moves to the end.
      const end = h.payloadEndOffset;
      mars.offset = end;
      h.payloadEndOffset = end + 8 * fields + 2 * fields;
    });
  }

  it("parses the q body the cases below change", () => {
    expect(refusal(quantised())).toBe("parsed");
  });

  it("refuses a quantum that is missing, zero or negative", () => {
    const message = /quantum q must be finite and positive/u;
    expectRefusal(quantised((l) => delete l.q), "bad-header", message);
    expectRefusal(quantised((l) => (l.q = 0)), "bad-header", message);
    expectRefusal(quantised((l) => (l.q = -1e-3)), "bad-header", message);
  });

  it("refuses widths or field offsets that do not list one entry per field", () => {
    expectRefusal(quantised((l) => l.widths.pop()), "bad-header", /widths has the wrong length/u);
    expectRefusal(quantised((l) => (l.widths = 2)), "bad-header", /widths has the wrong length/u);
    expectRefusal(quantised((l) => l.fieldOffset.push(12)), "bad-header", /fieldOffset has the wrong length/u);
  });

  it("refuses widths 6 and 7, and accepts 0 to 5 and 8", () => {
    for (const w of [6, 7, 9, -1]) {
      expectRefusal(quantised((l) => (l.widths[0] = w)), "bad-header", new RegExp(`field width ${w} is not supported`, "u"));
    }
    for (const w of [0, 1, 2]) expect(refusal(quantised((l) => (l.widths[0] = w)))).toBe("parsed");
  });

  it("refuses a field offset that is not a safe count, and a field that ends past the stride", () => {
    expectRefusal(quantised((l) => (l.fieldOffset[1] = -2)), "bad-header", /fieldOffset\[1\] is not a safe/u);
    expectRefusal(quantised((l) => (l.fieldOffset[5] = 11)), "bad-geometry", /field 5 ends past the stride/u);
  });

  it("refuses a mid-point table that runs into the records", () => {
    expectRefusal(quantised((l) => (l.recordsOffset -= 1)), "bad-geometry", /mid-point table runs into the records/u);
  });
});

describe("the pack reader, once a header has parsed", () => {
  it("refuses a pack that lacks a body the reduction reads", () => {
    const bytes = pack({ header: baseHeader(NAMES.filter((name) => name !== "plutoBary")) });
    expect(() => new PackEphemeris(bytes, parsePack(bytes))).toThrow(/does not contain plutoBary/u);
  });

  it("refuses an unknown body and an instant outside the body's records, with codes", () => {
    const bytes = pack();
    const reader = new PackEphemeris(bytes, parsePack(bytes));
    const out = new Float64Array(6);
    const code = (f: () => unknown): string | undefined => {
      try {
        f();
      } catch (error) {
        return error instanceof De440Error ? error.code : "other";
      }
      return undefined;
    };
    expect(code(() => reader.raw("chiron", 0, out))).toBe("unknown-body");
    expect(code(() => reader.state("Chiron", 0, out))).toBe("unknown-body");
    expect(code(() => reader.raw("marsBary", RADIUS + 1, out))).toBe("out-of-coverage");
    expect(code(() => reader.raw("marsBary", -RADIUS - 1, out))).toBe("out-of-coverage");
    expect(code(() => reader.raw("marsBary", RADIUS, out))).toBeUndefined();
    expect(reader.covers(RADIUS)).toBe(true);
    expect(reader.covers(RADIUS + 1)).toBe(false);
    expect(reader.covers(Number.NaN)).toBe(false);
  });
});

describe("openDe440Pack, with a header the parser refuses", () => {
  const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

  it("passes the parser's code through once the digest matches", async () => {
    const bytes = edited((h) => (h.formatVersion = 3));
    await expect(openDe440Pack(bytes, { expectDigest: sha256(bytes) })).rejects.toMatchObject({ code: "unsupported-version" });
  });

  it("reports no compiler when the header names none, or names one without a string version", async () => {
    const without = edited((h) => delete h.compiler);
    expect((await openDe440Pack(without, { expectDigest: sha256(without) })).pack.compiler).toBeNull();
    const numeric = edited((h) => (h.compiler.version = 1));
    expect((await openDe440Pack(numeric, { expectDigest: sha256(numeric) })).pack.compiler).toBeNull();
  });
});
