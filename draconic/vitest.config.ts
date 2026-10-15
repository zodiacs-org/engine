import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: ".cache/vite",
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    poolOptions: { forks: { singleFork: true } }
  }
});
