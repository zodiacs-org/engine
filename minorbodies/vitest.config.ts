import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: ".cache/vite",
  test: {
    include: ["tests/**/*.test.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } }
  }
});
