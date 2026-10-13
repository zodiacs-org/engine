import * as wasm from "../pkg/zodiacs_rustcore.js";

let initialized = false;

/** Supply the locally built WASM bytes or a compiled module before calculation. */
export function initRustCore(module: BufferSource | WebAssembly.Module): void {
  wasm.initSync({ module });
  initialized = true;
}

export function ready(): void {
  if (!initialized) throw new Error("Call initRustCore with the WASM module before calculating.");
}

