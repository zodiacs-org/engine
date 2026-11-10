import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { WASM_BUILD_ID } from "../generated/wasm-build.js";

it("requires explicit initialization, recovers after invalid bytes, and reuses its instance", async () => {
  vi.resetModules();
  const core = await import("../ts/index.js");
  const policy = core.createAspectPolicy();
  expect(Object.isFrozen(policy)).toBe(true);
  expect(policy).toEqual(core.DEFAULT_ASPECT_POLICY);
  expect(() => core.normalizeLongitude(15)).toThrow("Call initRustCore");
  expect(() => core.positions("2001-03-21T06:00:00Z")).toThrow("Call initRustCore");
  expect(() => core.timeBasis(0)).toThrow("Call initRustCore");
  expect(() => core.eclipticOfDate(1, 0, 0, 0)).toThrow("Call initRustCore");
  expect(() => core.computeAngles({ gastHours: 0, latitude: 0, longitude: 0, obliquity: 23 })).toThrow("Call initRustCore");
  expect(() => core.wholeSignCusps(0)).toThrow("Call initRustCore");
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
  // Once initialized, calls keep that instance and do not compile other input.
  core.initRustCore(new Uint8Array([0]));
  expect(core.normalizeLongitude(375)).toBe(15);
});

it("rejects unpaired or stale valid modules before initializing and permits retry", async () => {
  vi.resetModules();
  const core = await import("../ts/index.js");
  const empty = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
  for (const module of [empty, new WebAssembly.Module(empty)]) {
    expect(() => core.initRustCore(module)).toThrow("WASM build does not match");
    expect(() => core.normalizeLongitude(0)).toThrow("Call initRustCore");
  }
  const bytes = readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url));
  const stale = Buffer.from(bytes);
  const identityOffset = stale.indexOf(WASM_BUILD_ID);
  expect(identityOffset).toBeGreaterThan(0);
  stale[identityOffset] = stale[identityOffset] === 48 ? 49 : 48;
  expect(() => core.initRustCore(new WebAssembly.Module(stale))).toThrow(TypeError);
  expect(() => core.positions("2001-03-21T06:00:00Z")).toThrow("Call initRustCore");
  core.initRustCore(bytes);
  expect(core.normalizeLongitude(-1)).toBe(359);
});

it("accepts ArrayBuffers and byte views with a nonzero offset", async () => {
  const bytes = readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url));
  const padded = new Uint8Array(bytes.length + 16);
  padded.set(bytes, 8);
  for (const module of [Uint8Array.from(bytes).buffer, padded.subarray(8, -8), new DataView(padded.buffer, 8, bytes.length)]) {
    vi.resetModules();
    const core = await import("../ts/index.js");
    core.initRustCore(module);
    expect(core.normalizeLongitude(-15)).toBe(345);
  }
});
