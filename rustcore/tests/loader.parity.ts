import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

it("requires explicit initialization, recovers after invalid bytes, and reuses its instance", async () => {
  vi.resetModules();
  const core = await import("../ts/index.js");
  const policy = core.createAspectPolicy();
  expect(Object.isFrozen(policy)).toBe(true);
  expect(policy).toEqual(core.DEFAULT_ASPECT_POLICY);
  expect(() => core.normalizeLongitude(15)).toThrow("Call initRustCore");
  expect(() => core.aspectMotion({ lon: 0, speed: 1 }, { lon: 1, speed: 0 }, 0)).toThrow("Call initRustCore");
  expect(() => core.matchAspect("Sun", 0, "Moon", 90)).toThrow("Call initRustCore");
  expect(() => core.findAspects([])).toThrow("Call initRustCore");
  expect(() => core.findInterAspects([], [])).toThrow("Call initRustCore");
  expect(() => core.findConfiguredAspects([], policy)).toThrow("Call initRustCore");
  expect(() => core.initRustCore(new Uint8Array([0, 1, 2]))).toThrow(WebAssembly.CompileError);
  expect(() => core.normalizeLongitude(15)).toThrow("Call initRustCore");
  expect(() => core.findAspects([])).toThrow("Call initRustCore");
  expect(() => core.findConfiguredAspects([], policy)).toThrow("Call initRustCore");

  const bytes = readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url));
  core.initRustCore(new WebAssembly.Module(bytes));
  expect(core.normalizeLongitude(-15)).toBe(345);
  expect(core.findAspects([])).toEqual([]);
  expect(core.findConfiguredAspects([], policy).policy).toBe(policy);
  core.initRustCore(bytes);
  expect(core.normalizeLongitude(375)).toBe(15);
});
