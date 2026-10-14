import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: "node_modules/.vite",
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    maxWorkers: 1,
    minWorkers: 1
  }
});
