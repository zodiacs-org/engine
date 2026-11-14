import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { sha256Hex } from "./sha256.js";

// The arbiter is Node's own SHA-256 (OpenSSL's), a separate implementation.
const node = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

describe("the engine's synchronous SHA-256", () => {
  it("gives the FIPS 180-4 digests of the empty message and of abc", () => {
    expect(sha256Hex(new Uint8Array(0))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("agrees with Node's implementation at every length from 0 to 300 bytes and at 1,000,003", () => {
    let seed = 12345;
    const next = (): number => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24;
    for (const length of [...Array.from({ length: 301 }, (_unused, index) => index), 1_000_003]) {
      const bytes = Uint8Array.from({ length }, next);
      expect(sha256Hex(bytes), `length ${length}`).toBe(node(bytes));
    }
  });

  it("reads a view at its own offset", () => {
    const whole = Uint8Array.from({ length: 200 }, (_unused, index) => index);
    expect(sha256Hex(whole.subarray(37, 150))).toBe(node(whole.subarray(37, 150)));
  });
});
