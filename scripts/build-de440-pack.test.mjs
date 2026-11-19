import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { committedBytes, moduleText, KERNEL_SHA256, PACK_BYTES, PACK_FILE, PACK_SHA256 } from "./build-de440-pack.mjs";

/*
 * The pack itself is not rebuilt here: that takes NAIF's de440.bsp and
 * zodiacs.org's compiler (docs/de440.md). What is checked is that the
 * committed src/de440/pack-data.ts is the generator's text for bytes with the
 * digest and size it names, and that the entry describes the same pack.
 */
describe("scripts/build-de440-pack.mjs", () => {
  const text = readFileSync(new URL("../src/de440/pack-data.ts", import.meta.url), "utf8");

  it("wrote src/de440/pack-data.ts, byte for byte, from the pack it names", () => {
    const bytes = committedBytes(text);
    expect(bytes.byteLength).toBe(PACK_BYTES);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(PACK_SHA256);
    expect(text === moduleText(bytes)).toBe(true);
    expect(text.split("\n")).toHaveLength(3);
  });

  it("refuses other bytes", () => {
    const bytes = committedBytes(text);
    bytes[bytes.length - 1] ^= 1;
    expect(() => moduleText(bytes)).toThrow(/SHA-256/u);
    expect(() => moduleText(bytes.subarray(1))).toThrow(/bytes/u);
  });

  it("names the pack the entry describes", () => {
    const entry = readFileSync(new URL("../src/de440-pack.ts", import.meta.url), "utf8");
    for (const value of [PACK_FILE, PACK_SHA256, String(PACK_BYTES), KERNEL_SHA256]) expect(entry).toContain(`${value}`);
  });
});
