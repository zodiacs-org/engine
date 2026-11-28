import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: ".cache/vite",
  resolve: {
    // Relative engine imports live outside this private project's dependency tree.
    // Resolve their pinned dependency here without installing into the repo root.
    alias: {
      "astronomy-engine": fileURLToPath(new URL("./node_modules/astronomy-engine/esm/astronomy.js", import.meta.url))
    }
  },
  test: {
    include: ["test/**/*.test.ts"],
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1
  }
});
