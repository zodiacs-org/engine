import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: ".cache/vite",
  resolve: {
    // Parent sources are read-only and use this project's pinned dependency.
    alias: {
      "astronomy-engine": fileURLToPath(new URL("node_modules/astronomy-engine/esm/astronomy.js", import.meta.url))
    }
  },
  test: {
    // Keep calendar's optional test dependencies out of the parent test scan.
    include: ["test/**/*.calendar-test.ts"],
    maxWorkers: 2
  }
});
