// Browser lifecycle and synchronous result smoke checks. Numeric parity and its
// explicit tolerances are tested separately in the Vitest parity corpus.
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function throws(action: () => unknown, type: new (message?: string) => Error, message?: string): void {
  try { action(); } catch (error) {
    check(error instanceof type, `Expected ${type.name}, received ${String(error)}.`);
    if (message) check(error.message.includes(message), `Missing error text: ${message}.`);
    return;
  }
  throw new Error(`Expected ${type.name}.`);
}

export async function runSmoke(mode: "bytes" | "module"): Promise<{ mode: string; passed: true }> {
  const nativeFetch = globalThis.fetch;
  const nativeModule = WebAssembly.Module;
  const nativeInstance = WebAssembly.Instance;
  const nativeCompile = WebAssembly.compile;
  const nativeInstantiate = WebAssembly.instantiate;
  const nativeCompileStreaming = WebAssembly.compileStreaming;
  const nativeInstantiateStreaming = WebAssembly.instantiateStreaming;
  const nativeSend = XMLHttpRequest.prototype.send;
  let modules = 0;
  let instances = 0;
  let asynchronousWasm = 0;
  let network = 0;
  const noNetwork = (): never => { network++; throw new Error("Unexpected runtime network request."); };
  globalThis.fetch = noNetwork;
  XMLHttpRequest.prototype.send = noNetwork;
  WebAssembly.Module = new Proxy(nativeModule, {
    construct(target, args) { modules++; return Reflect.construct(target, args); }
  });
  WebAssembly.Instance = new Proxy(nativeInstance, {
    construct(target, args) { instances++; return Reflect.construct(target, args); }
  });
  const asyncProbe = { apply(): never { asynchronousWasm++; throw new Error("Unexpected asynchronous WASM initialization."); } };
  WebAssembly.compile = new Proxy(nativeCompile, asyncProbe);
  WebAssembly.instantiate = new Proxy(nativeInstantiate, asyncProbe);
  WebAssembly.compileStreaming = new Proxy(nativeCompileStreaming, asyncProbe);
  WebAssembly.instantiateStreaming = new Proxy(nativeInstantiateStreaming, asyncProbe);

  try {
    const core = await import("../ts/index.js");
    check(modules === 0 && instances === 0 && asynchronousWasm === 0 && network === 0,
      "Import must not initialize WASM or issue a network request.");
    check(Object.isFrozen(core.createAspectPolicy()), "Policy metadata must work before initialization.");
    const date = "2001-02-03T04:05:06.789Z";
    const input = { gastHours: 11.5, latitude: 25, longitude: -35, obliquity: 23.4 };
    const angles = { asc: 0, mc: 270, dsc: 180, ic: 90 };
    for (const calculate of [
      () => core.normalizeLongitude(-15), () => core.positions(date),
      () => core.timeBasis(Date.parse(date)), () => core.dateFrom(date, "date"),
      () => core.computeAngles(input), () => core.computeHouses("whole", input, angles),
      () => core.findAspects([]), () => core.findConfiguredAspects([], core.createAspectPolicy())
    ]) throws(calculate, Error, "Call initRustCore");
    throws(() => core.initRustCore(new Uint8Array([0, 1, 2])), WebAssembly.CompileError);
    // A valid module with the wrong exports must not poison wasm-bindgen's
    // singleton. The matching build can still initialize after this refusal.
    const emptyModule = new nativeModule(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    throws(() => core.initRustCore(emptyModule), TypeError, "WASM build does not match");
    throws(() => core.normalizeLongitude(-15), Error, "Call initRustCore");

    // Loading bytes is an explicit caller action; the runtime's fetch remains
    // blocked for the entire smoke test.
    const response = await nativeFetch("/core.wasm");
    check(response.ok, "Could not explicitly fetch local WASM bytes.");
    const bytes = await response.arrayBuffer();
    const supplied = mode === "module" ? new nativeModule(bytes) : bytes;
    check(core.initRustCore(supplied) === undefined, "Initialization must be synchronous and return void.");
    check(core.normalizeLongitude(-15) === 345, "Angular calculation failed.");
    const resolved = core.dateFrom(date, "date");
    check(resolved instanceof Date && resolved.toISOString() === date, "Resolved instant must be a native Date.");
    const clock = core.timeBasis(resolved.getTime());
    check(clock.utcMs === resolved.getTime() && Number.isFinite(clock.ttDays) && Number.isFinite(clock.ut1Days),
      "Time basis result shape failed.");
    check(clock.timeScale.input === "utc" && clock.timeScale.basis === "iers", "Time basis metadata failed.");
    check(Number.isFinite(core.tilt(clock.ttDays).tobl), "Coordinate helper failed.");
    const positions = core.positions(date);
    check(Array.isArray(positions), "Positions must return a synchronous array.");
    check(positions.map(row => row.body).join(",") ===
      "Sun,Moon,Mercury,Venus,Mars,Jupiter,Saturn,Uranus,Neptune,Pluto,North Node,South Node", "Position rows are incomplete.");
    for (const row of positions) {
      check(Number.isFinite(row.lon) && Number.isFinite(row.lat) && Number.isFinite(row.speed), "Nonfinite position.");
      check(row.lon >= 0 && row.lon < 360 && row.sign === core.signForLongitude(row.lon).slug, "Position sign failed.");
      check(row.retrograde === (row.speed < 0), "Position motion flag failed.");
    }
    for (const latitude of [-80, 25, 80]) {
      const location = { ...input, latitude };
      const computedAngles = core.computeAngles(location);
      for (const system of core.HOUSE_SYSTEMS) {
        const result = core.computeHouses(system, location, computedAngles);
        check(result.houses.cusps.length === 12 && result.houses.cusps.every(Number.isFinite), "House result failed.");
        const fallback = Math.abs(latitude) === 80 && core.isPolarUndefinedHouseSystem(system);
        check(result.fellBack === fallback && result.houses.system === (fallback ? "whole" : system), "Polar fallback failed.");
        const house = core.houseOf(positions[0]!.lon, result.houses.cusps);
        check(house >= 1 && house <= 12, "House membership failed.");
      }
    }
    const pair = positions.slice(0, 2).map((row, i) => ({ ...row, lon: i * 90, speed: 1 - i }));
    const legacy = core.findAspects(pair);
    check(Array.isArray(legacy) && legacy.length === 1 && legacy[0]!.type === "square" && legacy[0]!.orb === 0,
      "Legacy aspects must return a synchronous square result.");
    const policy = core.createAspectPolicy({ aspects: [{ type: "square", orb: 0 }] });
    const configured = core.findConfiguredAspects(pair, policy);
    check(configured.policy === policy && Object.isFrozen(configured) && Object.isFrozen(configured.aspects),
      "Configured aspect result identity/freeze failed.");
    check(configured.aspects.length === 1 && configured.aspects[0]!.type === "square" && configured.aspects[0]!.orb === 0,
      "Configured aspect calculation failed.");
    throws(() => core.positions("2001-02-30T00:00:00Z"), RangeError);
    throws(() => core.normalizeLongitude(NaN), RangeError, "Longitude must be finite");
    throws(() => core.houseOf(0, []), RangeError, "House cusps must contain 12 longitudes");
    throws(() => core.findConfiguredAspects([{ body: "Sun", lon: NaN, speed: 0 }], policy), RangeError);

    const initializedModules = modules;
    const initializedInstances = instances;
    core.initRustCore(new nativeModule(bytes));
    core.initRustCore(new Uint8Array([0]));
    check(modules === initializedModules && instances === initializedInstances, "Repeated init must reuse the instance.");
    check(core.normalizeLongitude(375) === 15, "Repeated init damaged the runtime.");
    check(network === 0 && asynchronousWasm === 0, "Calculations must not fetch or initialize asynchronously.");
    return { mode, passed: true };
  } finally {
    globalThis.fetch = nativeFetch;
    XMLHttpRequest.prototype.send = nativeSend;
    WebAssembly.Module = nativeModule;
    WebAssembly.Instance = nativeInstance;
    WebAssembly.compile = nativeCompile;
    WebAssembly.instantiate = nativeInstantiate;
    WebAssembly.compileStreaming = nativeCompileStreaming;
    WebAssembly.instantiateStreaming = nativeInstantiateStreaming;
  }
}
