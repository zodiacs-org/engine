import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { bindWasmBuild, BUILD_SECTION } from "./wasm-build.mjs";

const emptyModule = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);

test("WASM build identity is deterministic, preserves exports and binds the glue", () => {
  const glue = Buffer.from("synthetic glue");
  const build = bindWasmBuild(emptyModule, glue);
  const module = new WebAssembly.Module(build.bytes);
  assert.equal(build.digest, createHash("sha256").update(emptyModule).update(glue).digest("hex"));
  assert.equal(Buffer.from(WebAssembly.Module.customSections(module, BUILD_SECTION)[0]).toString(), build.digest);
  assert.deepEqual(WebAssembly.Module.exports(module), []);
  assert.deepEqual(WebAssembly.Module.imports(module), []);
  assert.deepEqual(bindWasmBuild(emptyModule, glue), build);
  assert.notEqual(bindWasmBuild(emptyModule, Buffer.from("other glue")).digest, build.digest);
  assert.match(build.source, new RegExp(build.digest));
});

test("invalid or already paired artifacts cannot gain another identity section", () => {
  assert.throws(() => bindWasmBuild(Buffer.from([0]), Buffer.alloc(0)), WebAssembly.CompileError);
  const build = bindWasmBuild(emptyModule, Buffer.alloc(0));
  assert.throws(() => bindWasmBuild(build.bytes, Buffer.alloc(0)), /already present/);
});
