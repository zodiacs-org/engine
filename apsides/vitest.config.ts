import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: ".cache/vitest",
  test: {
    // Keep the root's default Vitest discovery independent of this local install.
    include: ["test/**/*.vitest.ts"],
    environment: "node",
    pool: "forks",
    maxWorkers: 2,
    minWorkers: 1
  }
});
