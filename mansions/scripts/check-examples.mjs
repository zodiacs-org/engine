import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const project = fileURLToPath(new URL("..", import.meta.url));
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const examples = [...readme.matchAll(/^```ts\r?\n([\s\S]*?)^```\s*$/gm)];
assert(examples.length > 0, "README must contain runnable TypeScript examples");

// Each fenced TypeScript example is standalone, imports the local library and
// names its calculation result `result`. Execute the actual documented text,
// without writing bundles or using the engine's dist/ or root dependencies.
for (const [index, match] of examples.entries()) {
  const bundle = await build({
    stdin: {
      contents: `${match[1]}\nif (result.status !== "ok") throw new Error("README example returned a refusal.");\n`,
      resolveDir: project,
      sourcefile: `README-example-${index + 1}.ts`,
      loader: "ts"
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    target: "node22",
    logLevel: "silent",
    alias: { "astronomy-engine": fileURLToPath(import.meta.resolve("astronomy-engine")) }
  });
  // A fresh process prevents earlier examples from supplying missing imports
  // or variables. Keep full receipt output out of the verification log.
  execFileSync(process.execPath, ["--input-type=module"], {
    input: bundle.outputFiles[0].contents,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
}
console.log("README TypeScript examples execute successfully against the checkout source.");
