/**
 * A sealed ephemeris pack (`ZODEPH02`): the header, checked before anything
 * is read through it, and the Chebyshev records it describes. The format,
 * its checks and the evaluator are the research runtime's
 * (examples/precision-alpha/src/core/container.mjs and ephemeris.mjs in the
 * site repository), operation for operation, so a position read here equals
 * the runtime's bit for bit. Positions are kilometres and velocities
 * kilometres per second, in the ICRF, at TDB seconds past J2000.
 *
 * Environment-neutral: no file or network access. The caller hands over the
 * bytes; they are copied, so nothing the caller does afterwards can change
 * what was checked.
 */

/** Every way a pack or a request on it can be refused. */
export type De440ErrorCode =
  | "not-a-pack"
  | "unsupported-version"
  | "too-large"
  | "truncated"
  | "bad-header"
  | "bad-geometry"
  | "digest-mismatch"
  | "unknown-body"
  | "out-of-coverage"
  | "bad-instant"
  | "bad-geometry-of-sky";

/** A refusal with a code a caller can branch on. Messages carry no file paths. */
export class De440Error extends Error {
  readonly code: De440ErrorCode;
  constructor(code: De440ErrorCode, message: string) {
    super(message);
    this.name = "De440Error";
    this.code = code;
  }
}

export function fail(code: De440ErrorCode, message: string): never {
  throw new De440Error(code, message);
}

export const MAGIC_V2 = "ZODEPH02";
export const TRAILER_BYTES = 32;
const PROLOGUE_BYTES = 16;

/** Caps, checked before anything is allocated from a length the header gives. */
const LIMITS = /*#__PURE__*/ Object.freeze({
  /** 256 MiB. */
  maxFileBytes: 268_435_456,
  /** 4 MiB. */
  maxHeaderBytes: 4_194_304,
  maxBodies: 64,
  maxCoefficients: 512,
  maxRecords: 20_000_000,
  minIntervalSec: 1,
  /** 4000 Julian years. */
  maxIntervalSec: 126_230_400_000
});

const isSafeCount = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;

function safeExtent(where: string, a: number, b: number, c = 0): number {
  if (!isSafeCount(a) || !isSafeCount(b) || !isSafeCount(c)) {
    fail("bad-header", `${where}: extent operands must be safe non-negative integers`);
  }
  const product = a * b;
  if (!Number.isSafeInteger(product)) fail("bad-header", `${where}: extent overflows exact integer range`);
  const total = product + c;
  if (!Number.isSafeInteger(total)) fail("bad-header", `${where}: extent overflows exact integer range`);
  return total;
}

interface Layout {
  enc: "q" | "f64";
  stride: number;
  midsOffset: number;
  recordsOffset: number;
  q: number;
  widths: number[];
  fieldOffset: number[];
}

/** One stored body as the header declares it. */
export interface PackBody {
  name: string;
  ncoef: number;
  nrec: number;
  offset: number;
  initEt: number;
  intervalSec: number;
  frame: "ssb" | "sun" | "native";
  layout: Layout;
}

/** What a header says, once checked. */
export interface PackHeader {
  readonly coverage: { readonly startEtSecTdb: number; readonly stopEtSecTdb: number };
  readonly bodies: readonly PackBody[];
  readonly emrat: number;
  readonly raw: Readonly<Record<string, unknown>>;
}

/**
 * Parse and check a sealed pack's prologue and header against the bytes. It
 * does not check a digest: the entry point does that first, over the whole
 * file, against the digest its caller expects.
 */
export function parsePack(u8: Uint8Array): PackHeader & { payloadEnd: number; digestRegionEnd: number } {
  const total = u8.byteLength;
  if (total > LIMITS.maxFileBytes) fail("too-large", `pack is ${total} bytes; the limit is ${LIMITS.maxFileBytes}`);
  if (total < PROLOGUE_BYTES + TRAILER_BYTES + 2) fail("truncated", `pack is ${total} bytes, too short to be one`);
  const magic = String.fromCharCode(...u8.subarray(0, 8));
  if (magic !== MAGIC_V2) fail("not-a-pack", "not a sealed zodiacs ephemeris pack (ZODEPH02)");
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const headerLen = dv.getUint32(8, true);
  const payloadOffset = dv.getUint32(12, true);
  if (headerLen === 0 || headerLen > LIMITS.maxHeaderBytes) {
    fail("bad-header", `header length ${headerLen} is outside 1..${LIMITS.maxHeaderBytes}`);
  }
  const headerEnd = safeExtent("header", PROLOGUE_BYTES, 1, headerLen);
  if (headerEnd > total) fail("truncated", `header claims ${headerLen} bytes; only ${total - PROLOGUE_BYTES} remain`);
  if (payloadOffset < headerEnd || payloadOffset > total) {
    fail("bad-header", `payload offset ${payloadOffset} is not inside the file after the header`);
  }
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(new TextDecoder().decode(u8.subarray(PROLOGUE_BYTES, headerEnd))) as Record<string, unknown>;
  } catch (error) {
    fail("bad-header", `header is not valid JSON: ${(error as Error).message}`);
  }
  if (!header || typeof header !== "object") fail("bad-header", "header is not an object");
  const digestRegionEnd = total - TRAILER_BYTES;
  const payloadEnd = header.payloadEndOffset;
  if (!isSafeCount(payloadEnd)) fail("bad-header", "payloadEndOffset is not a safe non-negative integer");
  if (payloadEnd > digestRegionEnd) {
    fail("truncated", `header declares ${payloadEnd} bytes of pack; only ${digestRegionEnd} precede the digest trailer`);
  }
  if (header.format !== "zodiacs-ephemeris-pack") fail("bad-header", "format is not zodiacs-ephemeris-pack");
  if (header.formatVersion !== 2) fail("unsupported-version", `formatVersion ${JSON.stringify(header.formatVersion)} is not 2`);
  const conventions = header.conventions as Record<string, unknown> | undefined;
  if (!conventions || conventions.chebyshev !== "spk-type-2" || conventions.units !== "km,km/s") {
    fail("bad-header", "the pack does not declare SPK type-2 Chebyshev series in km and km/s");
  }
  const coverage = header.coverage as Record<string, unknown> | undefined;
  const start = coverage?.startEtSecTdb;
  const stop = coverage?.stopEtSecTdb;
  if (typeof start !== "number" || typeof stop !== "number" || !Number.isFinite(start) || !Number.isFinite(stop) || !(stop > start)) {
    fail("bad-header", "coverage is missing, not finite or not increasing");
  }
  const emrat = (header.derived as { earth399?: { emrat?: unknown } } | undefined)?.earth399?.emrat;
  if (typeof emrat !== "number" || !Number.isFinite(emrat) || emrat < 80 || emrat > 83) {
    fail("bad-header", "the pack carries no plausible Earth/Moon mass ratio");
  }
  const bodies = checkBodies(header.bodies, payloadOffset, payloadEnd, start, stop);
  return { coverage: { startEtSecTdb: start, stopEtSecTdb: stop }, bodies, emrat, raw: header, payloadEnd, digestRegionEnd };
}

function checkBodies(list: unknown, payloadOffset: number, payloadEnd: number, covStart: number, covStop: number): PackBody[] {
  if (!Array.isArray(list) || list.length === 0) fail("bad-header", "header declares no bodies");
  if (list.length > LIMITS.maxBodies) fail("bad-header", `header declares ${list.length} bodies; the limit is ${LIMITS.maxBodies}`);
  const seen = new Set<string>();
  const spans: { name: string; start: number; end: number }[] = [];
  for (const b of list as PackBody[]) {
    if (!b || typeof b.name !== "string" || b.name.length === 0 || b.name.length > 64) fail("bad-header", "a body has no usable name");
    if (seen.has(b.name)) fail("bad-header", `body ${b.name} is declared twice`);
    seen.add(b.name);
    for (const [k, v] of [["ncoef", b.ncoef], ["nrec", b.nrec], ["offset", b.offset]] as const) {
      if (!isSafeCount(v)) fail("bad-header", `body ${b.name}: ${k} is not a safe non-negative integer`);
    }
    if (b.ncoef < 2 || b.ncoef > LIMITS.maxCoefficients) fail("bad-header", `body ${b.name}: ncoef ${b.ncoef} is out of range`);
    if (b.nrec < 1 || b.nrec > LIMITS.maxRecords) fail("bad-header", `body ${b.name}: nrec ${b.nrec} is out of range`);
    if (!Number.isFinite(b.initEt)) fail("bad-header", `body ${b.name}: initEt is not finite`);
    if (!Number.isFinite(b.intervalSec) || b.intervalSec < LIMITS.minIntervalSec || b.intervalSec > LIMITS.maxIntervalSec) {
      fail("bad-header", `body ${b.name}: intervalSec ${b.intervalSec} is out of range`);
    }
    if (!["ssb", "sun", "native"].includes(b.frame)) fail("bad-header", `body ${b.name}: frame ${JSON.stringify(b.frame)} is not supported`);
    const layout = b.layout;
    if (!layout || typeof layout !== "object") fail("bad-header", `body ${b.name}: no layout`);
    if (layout.enc !== "q" && layout.enc !== "f64") fail("bad-header", `body ${b.name}: encoding is not supported`);
    for (const [k, v] of [["stride", layout.stride], ["midsOffset", layout.midsOffset], ["recordsOffset", layout.recordsOffset]] as const) {
      if (!isSafeCount(v)) fail("bad-header", `body ${b.name}: layout.${k} is not a safe non-negative integer`);
    }
    if (layout.stride === 0) fail("bad-header", `body ${b.name}: layout.stride is zero`);
    const fields = safeExtent(`body ${b.name} fields`, 3, b.ncoef);
    if (layout.enc === "q") {
      if (!Number.isFinite(layout.q) || layout.q <= 0) fail("bad-header", `body ${b.name}: quantum q must be finite and positive`);
      if (!Array.isArray(layout.widths) || layout.widths.length !== fields) fail("bad-header", `body ${b.name}: widths has the wrong length`);
      if (!Array.isArray(layout.fieldOffset) || layout.fieldOffset.length !== fields) fail("bad-header", `body ${b.name}: fieldOffset has the wrong length`);
      for (let f = 0; f < fields; f += 1) {
        const w = layout.widths[f]!;
        const off = layout.fieldOffset[f]!;
        // Width 6 is refused: the research runtime's reader weighs its top byte as 2^48, where its compiler wrote 2^40.
        if (![0, 1, 2, 3, 4, 5, 8].includes(w)) fail("bad-header", `body ${b.name}: field width ${w} is not supported`);
        if (!isSafeCount(off)) fail("bad-header", `body ${b.name}: fieldOffset[${f}] is not a safe non-negative integer`);
        if (safeExtent(`body ${b.name} field ${f}`, off, 1, w) > layout.stride) fail("bad-geometry", `body ${b.name}: field ${f} ends past the stride`);
      }
      if (safeExtent(`body ${b.name} mids`, fields, 8, layout.midsOffset) > layout.recordsOffset) {
        fail("bad-geometry", `body ${b.name}: the mid-point table runs into the records`);
      }
    } else if (safeExtent(`body ${b.name} stride`, fields, 8) > layout.stride) {
      fail("bad-geometry", `body ${b.name}: a float64 record does not fit the stride`);
    }
    const recBytes = safeExtent(`body ${b.name} records`, b.nrec, layout.stride, layout.recordsOffset);
    const start = b.offset;
    const end = safeExtent(`body ${b.name} end`, start, 1, recBytes);
    if (start < payloadOffset) fail("bad-geometry", `body ${b.name} starts before the payload`);
    if (end > payloadEnd) fail("truncated", `body ${b.name} runs past the payload`);
    const spanEnd = b.initEt + b.nrec * b.intervalSec;
    if (!Number.isFinite(spanEnd)) fail("bad-header", `body ${b.name}: record span is not finite`);
    if (b.initEt > covStart + 1 || spanEnd < covStop - 1) fail("bad-geometry", `body ${b.name} does not span the pack's coverage`);
    spans.push({ name: b.name, start, end });
  }
  spans.sort((x, y) => x.start - y.start);
  for (let i = 1; i < spans.length; i += 1) {
    if (spans[i]!.start < spans[i - 1]!.end) fail("bad-geometry", `bodies ${spans[i - 1]!.name} and ${spans[i]!.name} overlap`);
  }
  return list as PackBody[];
}

/** Read one little-endian signed field of `w` bytes. */
function readField(dv: DataView, base: number, w: number): number {
  switch (w) {
    case 0:
      return 0;
    case 1:
      return dv.getInt8(base);
    case 2:
      return dv.getInt16(base, true);
    case 3: {
      const lo = dv.getUint16(base, true);
      const hi = dv.getInt8(base + 2);
      return hi * 65536 + lo;
    }
    case 4:
      return dv.getInt32(base, true);
    case 5: {
      const lo = dv.getUint32(base, true);
      const hi = dv.getInt8(base + 4);
      return hi * 4294967296 + lo;
    }
    default:
      return dv.getFloat64(base, true);
  }
}

interface LoadedBody extends PackBody {
  coefficients: Float64Array;
  cachedRecord: number;
  mids: Float64Array | null;
}

/** The pack's names for the bodies the reduction reads. */
const PACK_NAME: Readonly<Record<string, string>> = /*#__PURE__*/ Object.freeze({
  Mercury: "mercuryBary",
  Venus: "venusBary",
  Mars: "marsBary",
  Jupiter: "jupiterBary",
  Saturn: "saturnBary",
  Uranus: "uranusBary",
  Neptune: "neptuneBary",
  Pluto: "plutoBary"
});

/**
 * The states a reduction reads, from a pack: `state` gives a body relative to
 * the solar-system barycentre, `lunar` the three parts of the Earth-Moon
 * system the geocentric Moon is formed from.
 */
export interface StateSource {
  covers(et: number): boolean;
  state(body: string, et: number, out: Float64Array): Float64Array;
  /** The Earth-Moon barycentre (from the SSB), the Moon and the Earth (each from that barycentre). */
  lunar(et: number, emb: Float64Array, moon: Float64Array, earth: Float64Array): void;
}

export class PackEphemeris implements StateSource {
  readonly coverage: { readonly startEtSecTdb: number; readonly stopEtSecTdb: number };
  private readonly u8: Uint8Array;
  private readonly bodies = new Map<string, LoadedBody>();
  private readonly k: number;
  private readonly scratch = new Float64Array(6);
  private readonly scratch2 = new Float64Array(6);

  constructor(u8: Uint8Array, header: PackHeader) {
    this.u8 = u8;
    this.coverage = header.coverage;
    this.k = 1 / header.emrat;
    for (const b of header.bodies) {
      const fields = 3 * b.ncoef;
      this.bodies.set(b.name, {
        ...b,
        coefficients: new Float64Array(fields),
        cachedRecord: -1,
        mids: b.layout.enc === "q" ? this.readMids(b, fields) : null
      });
    }
    for (const name of ["sun", "emb", "moon", ...Object.values(PACK_NAME)]) {
      if (!this.bodies.has(name)) fail("bad-header", `the pack does not contain ${name}`);
    }
  }

  private window(offset: number, length: number): DataView {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || offset + length > this.u8.byteLength) fail("truncated", "a read runs past the end of the pack");
    return new DataView(this.u8.buffer, this.u8.byteOffset + offset, length);
  }

  private readMids(b: PackBody, fields: number): Float64Array {
    const out = new Float64Array(fields);
    const dv = this.window(b.offset + b.layout.midsOffset, fields * 8);
    for (let i = 0; i < fields; i += 1) out[i] = dv.getFloat64(i * 8, true);
    return out;
  }

  private decode(b: LoadedBody, record: number): void {
    if (b.cachedRecord === record) return;
    const L = b.layout;
    const fields = 3 * b.ncoef;
    const base = b.offset + (L.enc === "f64" ? 0 : L.recordsOffset) + record * L.stride;
    const dv = this.window(base, L.enc === "f64" ? fields * 8 : L.stride);
    if (L.enc === "f64") {
      for (let f = 0; f < fields; f += 1) b.coefficients[f] = dv.getFloat64(f * 8, true);
    } else {
      const { widths, fieldOffset, q } = L;
      const mids = b.mids!;
      for (let f = 0; f < fields; f += 1) {
        const w = widths[f]!;
        b.coefficients[f] =
          w === 0 ? mids[f]! : w === 8 ? readField(dv, fieldOffset[f]!, 8) : mids[f]! + readField(dv, fieldOffset[f]!, w) * q;
      }
    }
    b.cachedRecord = record;
  }

  /** Is `et` (TDB seconds past J2000) inside the pack's declared coverage? */
  covers(et: number): boolean {
    const c = this.coverage;
    return Number.isFinite(et) && et >= c.startEtSecTdb && et <= c.stopEtSecTdb;
  }

  /** Position (km) and velocity (km/s) of one stored body, as stored. */
  raw(name: string, et: number, out: Float64Array): Float64Array {
    const b = this.bodies.get(name);
    if (!b) return fail("unknown-body", `the pack does not contain ${name}`);
    const span = b.nrec * b.intervalSec;
    if (et < b.initEt || et > b.initEt + span) fail("out-of-coverage", `${name}: ${et} s TDB is outside the pack's records`);
    let index = Math.floor((et - b.initEt) / b.intervalSec);
    if (index < 0) index = 0;
    if (index > b.nrec - 1) index = b.nrec - 1;
    // The rounded subtraction can put an et a hair below a record boundary
    // into the next record; step back so the series is never evaluated past
    // |tau| = 1.
    while (index > 0 && b.initEt + index * b.intervalSec > et) index -= 1;
    while (index < b.nrec - 1 && b.initEt + (index + 1) * b.intervalSec <= et) index += 1;
    this.decode(b, index);
    const mid = b.initEt + (index + 0.5) * b.intervalSec;
    const radius = b.intervalSec / 2;
    const tau = (et - mid) / radius;
    const n = b.ncoef;
    const c = b.coefficients;
    // Clenshaw for the value and for its derivative in one pass.
    for (let comp = 0; comp < 3; comp += 1) {
      const off = comp * n;
      let b1 = 0;
      let b2 = 0;
      let d1 = 0;
      let d2 = 0;
      for (let k = n - 1; k >= 1; k -= 1) {
        const t = b1;
        b1 = 2 * tau * b1 - b2 + c[off + k]!;
        b2 = t;
        const td = d1;
        d1 = 2 * tau * d1 - d2 + 2 * t;
        d2 = td;
      }
      out[comp] = tau * b1 - b2 + c[off]!;
      out[comp + 3] = (tau * d1 - d2 + b1) / radius;
    }
    return out;
  }

  private ssb(name: string, et: number, out: Float64Array): Float64Array {
    const b = this.bodies.get(name)!;
    this.raw(name, et, out);
    if (b.frame === "sun") {
      this.raw("sun", et, this.scratch2);
      for (let i = 0; i < 6; i += 1) out[i] = out[i]! + this.scratch2[i]!;
    }
    return out;
  }

  /** A body relative to the solar-system barycentre: Sun, Earth, Moon, Mercury to Pluto (Mars to Pluto as system barycentres). */
  state(body: string, et: number, out: Float64Array): Float64Array {
    if (out === this.scratch || out === this.scratch2) fail("bad-header", "state(): out must not be an internal buffer");
    if (body === "Sun") return this.ssb("sun", et, out);
    if (body === "Moon" || body === "Earth") {
      this.ssb("emb", et, out);
      this.ssb("moon", et, this.scratch);
      const f = body === "Moon" ? 1 : -this.k;
      for (let i = 0; i < 6; i += 1) out[i] = out[i]! + f * this.scratch[i]!;
      return out;
    }
    const key = PACK_NAME[body];
    if (!key) return fail("unknown-body", `unknown body ${body}`);
    return this.ssb(key, et, out);
  }

  lunar(et: number, emb: Float64Array, moon: Float64Array, earth: Float64Array): void {
    this.ssb("emb", et, emb);
    this.ssb("moon", et, moon);
    const f = -this.k;
    for (let i = 0; i < 6; i += 1) earth[i] = f * moon[i]!;
  }
}
