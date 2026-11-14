/**
 * `@zodiacs/engine/de440`: positions from JPL's DE440, through a sealed pack
 * of Chebyshev series refitted from it, for the engine to compute charts,
 * positions and events with (`withEphemeris` in the root entry).
 *
 * This entry fetches nothing: the caller gives the bytes (of a pack compiled
 * from its own copy of NAIF's `de440.bsp`, or of the one the package ships,
 * which the root entry and `@zodiacs/engine/de440/pack` open themselves) and
 * names the SHA-256 it expects. `openDe440Pack` hashes the whole file and
 * refuses any other bytes, then checks the pack's own trailer and header.
 * The returned source keeps a private copy of the bytes.
 *
 * The reduction is the research runtime's with its shipped options
 * (`src/de440/reduce.ts` says what it applies). Mars to Pluto are
 * planetary-system barycentres, not planet centres. Nothing in this entry's
 * graph imports astronomy-engine. From 1.1.0-rc.9 the root entry imports
 * this file, to open the shipped pack as its default source.
 */
import { De440Error, PackEphemeris, parsePack } from "./de440/pack.js";
import { BARYCENTRE_NOT_CENTRE, REDUCED_BODIES, Reducer } from "./de440/reduce.js";
import type { ReducedBody } from "./de440/reduce.js";
import { sha256Hex as sha256Sync } from "./de440/sha256.js";
import type { PositionSource } from "./types.js";

export { BARYCENTRE_NOT_CENTRE, De440Error, REDUCED_BODIES };
export type { De440ErrorCode } from "./de440/pack.js";
export type { ReducedBody };

/** The ephemeris a receipt names when a chart or position came from a DE440 pack. */
export const DE440_EPHEMERIS_NAME = "jpl-de440" as const;

/** What a DE440 source says about itself. */
export interface De440Source extends PositionSource {
  /** `version` is the SHA-256 of the sealed pack the positions came from. */
  readonly ephemeris: { readonly name: typeof DE440_EPHEMERIS_NAME; readonly version: string };
  /** The light-path distance too, au. */
  place(body: ReducedBody, ttDays: number): { lon: number; lat: number; dist: number };
  /**
   * The instants in [fromTtDays, toTtDays] (TT days past J2000.0), ascending,
   * at which a place or the true node may step by more than rounding: where
   * a read passes from one Chebyshev record of the pack to the next (within
   * the pack's fitting budget, src/de440/reduce.ts). Between two neighbours
   * every place is a smooth function of time. The birth-time window search
   * treats each as a seam.
   */
  steps(fromTtDays: number, toTtDays: number): number[];
  readonly pack: {
    readonly sha256: string;
    readonly bytes: number;
    /** TDB seconds past J2000, the pack's coverage. */
    readonly startEtSecTdb: number;
    readonly stopEtSecTdb: number;
    /** The compiler that made the pack, as its header names it, or null. */
    readonly compiler: { readonly name: string; readonly version: string } | null;
  };
}

export interface De440OpenOptions {
  /** The SHA-256 of the whole sealed pack file, lower-case hexadecimal, obtained from somewhere other than the pack. */
  readonly expectDigest: string;
}

/** The astronomical unit, kilometres (IAU 2012), as src/de440/reduce.ts has it. */
const AU_KM = 149597870.7;

const hex = (buffer: ArrayBuffer): string => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

async function sha256Hex(view: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new TypeError("openDe440Pack needs WebCrypto (crypto.subtle) to check the pack's digest");
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return hex(await subtle.digest("SHA-256", copy.buffer));
}

/**
 * Open a sealed DE440 pack (`ZODEPH02`) held in memory. Rejects with a
 * `De440Error` whose code says why: `digest-mismatch` when the file's SHA-256
 * is not `expectDigest` or the pack's trailer does not match its contents,
 * and the header codes of `src/de440/pack.ts` otherwise.
 */
export async function openDe440Pack(bytes: Uint8Array, options: De440OpenOptions): Promise<De440Source> {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("openDe440Pack: bytes must be a Uint8Array");
  const expect = options?.expectDigest;
  if (typeof expect !== "string" || !/^[0-9a-f]{64}$/.test(expect)) {
    throw new TypeError("openDe440Pack: expectDigest must be 64 lower-case hexadecimal digits");
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await sha256Hex(copy);
  if (digest !== expect) throw new De440Error("digest-mismatch", "the pack's SHA-256 is not the one expected");
  const header = parsePack(copy);
  const trailer = Array.from(copy.subarray(header.digestRegionEnd), (b) => b.toString(16).padStart(2, "0")).join("");
  if ((await sha256Hex(copy.subarray(0, header.digestRegionEnd))) !== trailer) {
    throw new De440Error("digest-mismatch", "the pack's own trailer does not match its contents");
  }
  return sourceOf(copy, digest, header);
}

/** A source on bytes whose digest and trailer have been checked. */
function sourceOf(copy: Uint8Array, digest: string, header: ReturnType<typeof parsePack>): De440Source {
  const reducer = new Reducer(new PackEphemeris(copy, header));
  const compiler = header.raw.compiler as { name?: unknown; version?: unknown } | undefined;
  const pack = Object.freeze({
    sha256: digest,
    bytes: copy.byteLength,
    startEtSecTdb: header.coverage.startEtSecTdb,
    stopEtSecTdb: header.coverage.stopEtSecTdb,
    compiler:
      typeof compiler?.name === "string" && typeof compiler.version === "string"
        ? Object.freeze({ name: compiler.name, version: compiler.version })
        : null
  });
  return Object.freeze({
    ephemeris: Object.freeze({ name: DE440_EPHEMERIS_NAME, version: digest }),
    pack,
    place(body: ReducedBody, ttDays: number): { lon: number; lat: number; dist: number } {
      const place = reducer.apparent(body, ttDays);
      return { lon: place.lon, lat: place.lat, dist: place.distKm / AU_KM };
    },
    trueNode(ttDays: number): number {
      return reducer.trueNode(ttDays);
    },
    steps(fromTtDays: number, toTtDays: number): number[] {
      return reducer.steps(fromTtDays, toTtDays);
    }
  });
}

/**
 * `openDe440Pack` without WebCrypto and without a promise: the same checks,
 * with the engine's own SHA-256 (`src/de440/sha256.ts`), for code that
 * cannot wait. It throws what `openDe440Pack` rejects with. The root entry
 * opens the shipped pack with it.
 */
export function openDe440PackSync(bytes: Uint8Array, options: De440OpenOptions): De440Source {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("openDe440PackSync: bytes must be a Uint8Array");
  const expect = options?.expectDigest;
  if (typeof expect !== "string" || !/^[0-9a-f]{64}$/.test(expect)) {
    throw new TypeError("openDe440PackSync: expectDigest must be 64 lower-case hexadecimal digits");
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = sha256Sync(copy);
  if (digest !== expect) throw new De440Error("digest-mismatch", "the pack's SHA-256 is not the one expected");
  const header = parsePack(copy);
  const trailer = Array.from(copy.subarray(header.digestRegionEnd), (b) => b.toString(16).padStart(2, "0")).join("");
  if (sha256Sync(copy.subarray(0, header.digestRegionEnd)) !== trailer) {
    throw new De440Error("digest-mismatch", "the pack's own trailer does not match its contents");
  }
  return sourceOf(copy, digest, header);
}
