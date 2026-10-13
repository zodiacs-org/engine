import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: ".cache/vite",
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    minWorkers: 1,
    maxWorkers: 2,
    restoreMocks: true
  }
});
