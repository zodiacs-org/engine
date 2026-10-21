import * as wasm from "../pkg/zodiacs_rustcore.js";
import { WASM_BUILD_ID, WASM_BUILD_SECTION } from "../generated/wasm-build.js";

let initialized = false;

/** Supply the locally built WASM bytes or a compiled module before calculation. */
export function initRustCore(module: BufferSource | WebAssembly.Module): void {
  if (initialized) return;
  // Some runtimes accept typed arrays but reject DataView despite BufferSource.
  // Preserve the supplied view's offset and length when normalizing its bytes.
  const input = ArrayBuffer.isView(module)
    ? new Uint8Array(module.buffer, module.byteOffset, module.byteLength) : module;
  const compiled = input instanceof WebAssembly.Module ? input : new WebAssembly.Module(input);
  const sections = WebAssembly.Module.customSections(compiled, WASM_BUILD_SECTION);
  // Check before initSync: its singleton stores exports before running the
  // generated start function, so a mismatched valid module could poison it.
  if (sections.length !== 1 || new TextDecoder().decode(sections[0]) !== WASM_BUILD_ID) {
    throw new TypeError("WASM build does not match this Rust core wrapper; load its matching pkg artifact.");
  }
  wasm.initSync({ module: compiled });
  initialized = true;
}

export function ready(): void {
  if (!initialized) throw new Error("Call initRustCore with the WASM module before calculating.");
}

