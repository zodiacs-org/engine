import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: ".cache/vite",
  // Engine source imports resolve the dependency from this isolated project.
  resolve: {
    alias: {
      "astronomy-engine": fileURLToPath(new URL("./node_modules/astronomy-engine/esm/astronomy.js", import.meta.url))
    }
  },
  test: {
    include: ["test/**/*.test.ts"],
    pool: "forks",
    maxWorkers: 2,
    minWorkers: 1
  }
});
