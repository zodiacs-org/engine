import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: ".cache/vite",
  // Relative engine source imports must resolve the dependency installed here,
  // without installing or changing anything in the engine checkout's root.
  resolve: {
    alias: [{
      find: /^astronomy-engine$/,
      replacement: fileURLToPath(new URL("./node_modules/astronomy-engine/esm/astronomy.js", import.meta.url))
    }]
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.mjs"],
    pool: "forks",
    minWorkers: 1,
    maxWorkers: 2
  }
});
