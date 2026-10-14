import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: ".cache/vite",
  test: {
    include: ["test/**/*.test.ts"],
    pool: "forks",
    maxWorkers: 2,
    minWorkers: 1
  }
});
