import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: "node_modules/.vite",
  // Relative engine source imports must use this project's pinned dependency,
  // even when the repository root has no installed dependencies.
  resolve: {
    alias: {
      "astronomy-engine": fileURLToPath(new URL("./node_modules/astronomy-engine/esm/astronomy.js", import.meta.url))
    }
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    maxWorkers: 1,
    minWorkers: 1
  }
});
