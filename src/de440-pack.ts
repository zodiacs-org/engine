/**
 * `@zodiacs/engine/de440/pack`: the sealed DE440 pack itself, shipped in the
 * package, and a source opened from it.
 *
 * The pack is `de440-1790-2210.v2.zeph` (`DE440_PACK`), the Chebyshev series
 * zodiacs.org's pack compiler 2.0.0 refits from NAIF's `de440.bsp` for 1790
 * to 2210, 2,489,664 bytes, carried as base64 text in one file of the
 * package, which this entry and the root entry share. From 1.1.0-rc.9 the
 * root entry computes on this pack by default (`src/ephemeris.ts`,
 * `defaultEphemeris`), so a caller needs this entry only for the bytes, the
 * description, or a source to hand to `withEphemeris` explicitly, which
 * refuses an instant outside the pack where the default falls back to
 * astronomy-engine. `shippedDe440Source` hashes the bytes and refuses them
 * unless their SHA-256 is `DE440_PACK.sha256`. This entry fetches nothing.
 */
import { openDe440PackSync } from "./de440.js";
import type { De440Source } from "./de440.js";
import { DE440_PACK_BASE64 } from "./de440/pack-data.js";

/** The pack this entry ships, and the kernel it was refitted from. */
export interface De440PackDescription {
  /** The sealed pack's file name where it was compiled. */
  readonly file: string;
  /** The SHA-256 of the sealed pack, lower-case hexadecimal: a source's `ephemeris.version`. */
  readonly sha256: string;
  /** The sealed pack's size in bytes. */
  readonly bytes: number;
  /** The first and last calendar years the pack was compiled for; a source refuses an instant outside its coverage. */
  readonly fromYear: number;
  readonly toYear: number;
  /** NAIF's kernel the series were refitted from. */
  readonly kernel: { readonly file: string; readonly sha256: string };
}

/** `de440-1790-2210.v2.zeph`, refitted from NAIF's `de440.bsp`. */
export const DE440_PACK: De440PackDescription = /*#__PURE__*/ Object.freeze({
  file: "de440-1790-2210.v2.zeph",
  sha256: "51428874d9a47213abc0ff42cbcec65f338624eaa2d8831f0e6ddc3654bf1fa7",
  bytes: 2489664,
  fromYear: 1790,
  toYear: 2210,
  kernel: /*#__PURE__*/ Object.freeze({
    file: "de440.bsp",
    sha256: "a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5"
  })
});

/** The shipped pack's bytes, a new array at each call. They are not checked here; `openShippedDe440Pack` checks them. */
export function de440PackBytes(): Uint8Array {
  const binary = atob(DE440_PACK_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let opened: De440Source | undefined;
let refused: unknown;

/**
 * A DE440 source on the shipped pack, opened without a promise: the first
 * call decodes the pack and opens it with `openDe440PackSync`, expecting
 * `DE440_PACK.sha256`; later calls give the same source, which holds no
 * state that a caller can change. If the pack cannot be opened (its bytes
 * are not the sealed pack's, or the runtime has no `atob`), the first call
 * throws, and every later call throws the same error without trying again.
 * The root entry's default source is this one.
 */
export function shippedDe440Source(): De440Source {
  if (opened) return opened;
  if (refused !== undefined) throw refused;
  try {
    opened = openDe440PackSync(de440PackBytes(), { expectDigest: DE440_PACK.sha256 });
  } catch (error) {
    refused = error ?? new Error("the shipped DE440 pack could not be opened");
    throw refused;
  }
  return opened;
}

/**
 * The same source as `shippedDe440Source`, as a promise, as 1.1.0-rc.8's
 * draft gave it: it rejects where that function throws.
 */
export function openShippedDe440Pack(): Promise<De440Source> {
  return new Promise((resolve) => resolve(shippedDe440Source()));
}
