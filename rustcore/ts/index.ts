import { initSync, normalizeLongitude as wasmNormalizeLongitude } from "../pkg/zodiacs_rustcore.js";

let initialized = false;

/** Supply the locally built WASM bytes or a compiled module before calculation. */
export function initRustCore(module: BufferSource | WebAssembly.Module): void {
  initSync({ module });
  initialized = true;
}

/** Same numeric signature and finite-input validation as src/signs.ts. */
export function normalizeLongitude(lon: number): number {
  if (!initialized) throw new Error("Call initRustCore with the WASM module before calculating.");
  // Keep the JS boundary strict: wasm-bindgen would coerce null or strings.
  if (!Number.isFinite(lon)) throw new RangeError("Longitude must be finite.");
  return wasmNormalizeLongitude(lon);
}
