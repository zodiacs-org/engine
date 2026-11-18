import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: ".cache/vite",
  resolve: {
    alias: { "astronomy-engine": fileURLToPath(import.meta.resolve("astronomy-engine")) }
  },
  test: {
    include: ["test/**/*.test.ts"],
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1
  }
});
