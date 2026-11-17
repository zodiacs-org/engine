import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { edgeRoot, readToolchain } from "../scripts/build-support.mjs";

const { alias } = await readToolchain();
const built = await build({
  absWorkingDir: edgeRoot,
  entryPoints: { exact: "src/exact.ts", workloads: "src/workloads.ts" },
  outdir: resolve(edgeRoot, ".generated/exact-test"),
  bundle: true, platform: "node", format: "esm", target: "es2022",
  alias, tsconfig: resolve(edgeRoot, "tsconfig.json"), write: false, logLevel: "silent"
});
const modules = Object.fromEntries(await Promise.all(built.outputFiles.map(async (file) => [
  file.path.endsWith("/exact.js") ? "exact" : "workloads",
  await import(`data:text/javascript;base64,${Buffer.from(file.contents).toString("base64")}`)
])));
const { serializeExact, parseExact, compareExact } = modules.exact;
const { runSmokeCases, runExactSmokeCases } = modules.workloads;

// Independent test-only reconstruction to check the complete engine data tree.
// Production consumers compare the tagged reports without decoding numbers.
function reconstruct(node) {
  switch (node[0]) {
    case "null": return null;
    case "undefined": return undefined;
    case "boolean": case "string": return node[1];
    case "number": return Buffer.from(node[1], "hex").readDoubleBE();
    case "date": return new Date(node[1] === "invalid" ? NaN : Buffer.from(node[1], "hex").readDoubleBE());
    case "array": {
      const result = new Array(node[1].length);
      for (const [i, item] of node[1].entries()) if (item[0] !== "hole") result[i] = reconstruct(item);
      return result;
    }
    case "object": {
      const result = Object.create(node[1] === "null" ? null : Object.prototype);
      for (const [key, item] of node[2]) Object.defineProperty(result, key, {
        value: reconstruct(item), enumerable: true, writable: true, configurable: true
      });
      return result;
    }
    default: throw new Error(`Unexpected tag ${node[0]}`);
  }
}

test("exact smoke transport retains the entire chart, houses and transit result tree", () => {
  const original = runSmokeCases();
  const text = runExactSmokeCases();
  assert.equal(text, serializeExact(original));
  assert.deepStrictEqual(reconstruct(parseExact(text)[1]), original);
  assert.equal(compareExact(text, runExactSmokeCases()), null);
});

test("a changed binary64 engine value reports its original body longitude path", () => {
  const result = runSmokeCases();
  const before = serializeExact(result);
  const body = result.charts[0].result.bodies[0];
  const bits = Buffer.alloc(8);
  bits.writeDoubleBE(body.lon);
  bits.writeBigUInt64BE(bits.readBigUInt64BE() + 1n);
  body.lon = bits.readDoubleBE();
  const difference = compareExact(before, serializeExact(result));
  assert.equal(difference.path, '$["charts"][0]["result"]["bodies"][0]["lon"]');
  assert.equal(difference.reason, "value");
  assert.notEqual(difference.expected, difference.actual);
});

test("Date replacement in a full chart cannot hide behind ordinary JSON equality", () => {
  const original = runSmokeCases();
  const changed = structuredClone(original);
  changed.charts[0].result.input.utc = changed.charts[0].result.input.utc.toISOString();
  assert.equal(JSON.stringify(changed), JSON.stringify(original));
  const difference = compareExact(serializeExact(original), serializeExact(changed));
  assert.equal(difference.path, '$["charts"][0]["result"]["input"]["utc"]');
  assert.equal(difference.reason, "type");
});
