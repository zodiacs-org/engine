import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

/** Compile the checkout CLI in memory, with the project-local pinned ephemeris. */
export async function loadCli() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../src/cli.ts", import.meta.url))],
    bundle: true, format: "esm", platform: "node", target: "node22", write: false, logLevel: "silent",
    plugins: [{
      name: "fixedstars-cli-ephemeris",
      setup(builder) {
        builder.onResolve({ filter: /^astronomy-engine$/u }, () => ({
          path: new URL("../node_modules/astronomy-engine/esm/astronomy.js", import.meta.url).href,
          external: true
        }));
      }
    }]
  });
  const code = result.outputFiles[0].text;
  assert(Buffer.byteLength(code) < 2_000_000, "CLI exceeds the project artifact size limit");
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

