// These describe portable builds, not deployed runtime versions.
export const FILE_LIMIT = 2_000_000;

export const TARGETS = Object.freeze({
  workers: Object.freeze({ platform: "neutral", conditions: Object.freeze(["workerd", "worker", "browser"]) }),
  deno: Object.freeze({ platform: "neutral", conditions: Object.freeze(["deno"]) }),
  bun: Object.freeze({ platform: "neutral", conditions: Object.freeze(["bun"]) }),
  browser: Object.freeze({ platform: "browser", conditions: Object.freeze(["browser"]) })
});

export function bundleConfig(target) {
  if (!Object.hasOwn(TARGETS, target)) throw new Error(`Unknown bundle target: ${target}`);
  return {
    ...TARGETS[target],
    conditions: [...TARGETS[target].conditions],
    entryPoints: {
      engine: "src/engine.ts",
      workloads: "src/workloads.ts",
      ...(target === "workers" ? { worker: "src/worker.ts" } : {}),
      ...(target === "deno" ? { deno: "src/deno.ts" } : {}),
      ...(target === "bun" ? { bun: "src/bun.ts" } : {})
    },
    bundle: true,
    packages: "bundle",
    format: "esm",
    target: "es2022",
    mainFields: ["module", "main"],
    outExtension: { ".js": ".mjs" },
    // Keep arithmetic expression order. Runtime equality is tested separately.
    minify: false,
    treeShaking: true,
    splitting: false,
    sourcemap: false,
    charset: "utf8",
    legalComments: "inline",
    banner: { js: "/*! @zodiacs/engine: MIT AND CC-BY-4.0. Retain LICENSE, LICENSING.md, NOTICE and ASTRONOMY-LICENSE.txt beside this bundle. */" }
  };
}
