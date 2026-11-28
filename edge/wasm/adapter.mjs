// This adapter is used only by the isolated experiment build.
let kernel;

export function initializeKernel(module, tables) {
  if (!(module instanceof WebAssembly.Module)) throw new TypeError("Expected a compiled WASM module.");
  const { ARGUMENTS, MULTIPLIERS, coefficients, OFFSETS, NUTATION_TERMS } = tables;
  const c = coefficients();
  if (NUTATION_TERMS !== 77 || ARGUMENTS.length !== 10 || c.length !== 462
    || MULTIPLIERS.length !== 385 || !/^[0-6]+$/.test(MULTIPLIERS) || OFFSETS.length !== 2
    || ![...ARGUMENTS, ...c, ...OFFSETS].every(Number.isFinite)) {
    throw new Error("Nutation table layout changed; review the WASM translation.");
  }
  const instance = new WebAssembly.Instance(module, {
    host: { sin: Math.sin, cos: Math.cos, remainder: (x, y) => x % y }
  });
  const { memory, dataPointer } = instance.exports;
  const pointer = dataPointer();
  new Float64Array(memory.buffer, pointer, 10).set(ARGUMENTS);
  new Float64Array(memory.buffer, pointer + 80, 462).set(c);
  new Uint8Array(memory.buffer, pointer + 3776, 385).set([...MULTIPLIERS].map((digit) => Number(digit)));
  new Float64Array(memory.buffer, pointer + 4752, 2).set(OFFSETS);
  kernel = { instance, result: new Float64Array(memory.buffer, pointer + 4728, 3) };
  return instance;
}

export function wasmNutation(t, terms) {
  if (!kernel) throw new Error("Initialize the experimental WASM kernel before calculating.");
  if (!Number.isFinite(t) || !Number.isInteger(terms) || terms < 0 || terms > 77) {
    throw new RangeError("Experimental nutation requires finite t and integer terms in [0, 77].");
  }
  kernel.instance.exports.nutation(t, terms);
  return { dpsi: kernel.result[0], deps: kernel.result[1], om: kernel.result[2] };
}
