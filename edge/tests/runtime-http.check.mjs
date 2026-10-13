import assert from "node:assert/strict";
import test from "node:test";
import { buildTarget } from "../scripts/build-bundles.mjs";

const importBytes = (bytes, label) => import(
  `data:text/javascript;base64,${Buffer.from(bytes).toString("base64")}#${label}`
);

// These run in Node. Native runtime serving is checked separately by the
// runtime launch script; importing an adapter must never open a listener.
for (const runtime of ["deno", "bun"]) {
  test(`${runtime} imports without a runtime global, server startup or outgoing fetch`, async (t) => {
    const { files, metafile } = await buildTarget(runtime, { write: false });
    const bytes = files.get(`${runtime}.mjs`);
    assert.ok(bytes, "The production adapter bundle must exist");
    const output = metafile.outputs[`.generated/${runtime}/${runtime}.mjs`];
    assert.ok(output);
    assert.deepEqual(output.imports, []);
    assert.deepEqual(output.exports, ["handleRequest"]);
    assert.equal(typeof globalThis.Deno, "undefined");
    assert.equal(typeof globalThis.Bun, "undefined");
    const outbound = t.mock.method(globalThis, "fetch", () => {
      throw new Error("Unexpected outbound request during adapter import");
    });

    const absentGlobals = await importBytes(bytes, "absent-globals");
    assert.deepEqual(Object.keys(absentGlobals), ["handleRequest"]);
    assert.equal(typeof absentGlobals.handleRequest, "function");

    // Also catch guarded probes such as `typeof Deno` at import time. A new
    // module URL prevents the ESM cache from hiding access to runtime globals.
    const saved = new Map(["Deno", "Bun"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    t.after(() => {
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    });
    for (const name of saved.keys()) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() { throw new Error(`Unexpected ${name} access during adapter import`); }
      });
    }
    const guardedGlobals = await importBytes(bytes, "guarded-globals");
    assert.deepEqual(Object.keys(guardedGlobals), ["handleRequest"]);
    assert.equal(typeof guardedGlobals.handleRequest, "function");
    assert.equal(outbound.mock.callCount(), 0);
  });
}
