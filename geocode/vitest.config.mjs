import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: ".cache/vitest",
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    maxWorkers: 2,
    minWorkers: 1
  }
});
