/**
 * `@zodiacs/engine/de440`: positions from JPL's DE440, through a sealed pack
 * of its Chebyshev series that the caller supplies, for the engine to compute
 * charts, positions and events with (`withEphemeris` in the root entry).
 *
 * The pack is not part of this package and this entry fetches nothing: the
 * caller reads the bytes (from a pack compiled from its own copy of NAIF's
 * `de440.bsp`) and names the SHA-256 it expects. `openDe440Pack` hashes the
 * whole file and refuses any other bytes, then checks the pack's own trailer
 * and header. The returned source keeps a private copy of the bytes.
 *
 * The reduction is the research runtime's with its shipped options
 * (`src/de440/reduce.ts` says what it applies). Mars to Pluto are
 * planetary-system barycentres, not planet centres. Nothing in this entry's
 * graph imports astronomy-engine, and the root entry does not import this
 * file (`scripts/root-isolation.mjs`).
 */
import { De440Error, PackEphemeris, parsePack } from "./de440/pack.js";
import { BARYCENTRE_NOT_CENTRE, REDUCED_BODIES, Reducer } from "./de440/reduce.js";
import type { ReducedBody } from "./de440/reduce.js";
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

const hex = (buffer: ArrayBuffer): string => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

async function sha256Hex(view: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new De440Error("digest-mismatch", "no WebCrypto is available to check the pack's digest");
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
    place(body: ReducedBody, ttDays: number): { lon: number; lat: number } {
      const place = reducer.apparent(body, ttDays);
      return { lon: place.lon, lat: place.lat };
    },
    trueNode(ttDays: number): number {
      return reducer.trueNode(ttDays);
    }
  });
}
