import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

it("requires explicit initialization, recovers after invalid bytes, and reuses its instance", async () => {
  vi.resetModules();
  const core = await import("../ts/index.js");
  expect(() => core.normalizeLongitude(15)).toThrow("Call initRustCore");
  expect(() => core.initRustCore(new Uint8Array([0, 1, 2]))).toThrow(WebAssembly.CompileError);
  expect(() => core.normalizeLongitude(15)).toThrow("Call initRustCore");

  const bytes = readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url));
  core.initRustCore(new WebAssembly.Module(bytes));
  expect(core.normalizeLongitude(-15)).toBe(345);
  core.initRustCore(bytes);
  expect(core.normalizeLongitude(375)).toBe(15);
});
