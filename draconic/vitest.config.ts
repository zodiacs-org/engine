import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // The sibling engine source must use this project's pinned dependency,
  // without installing or changing anything at the repository root.
  resolve: {
    alias: {
      "astronomy-engine": fileURLToPath(new URL("./node_modules/astronomy-engine/esm/astronomy.js", import.meta.url))
    }
  },
  cacheDir: ".cache/vite",
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    poolOptions: { forks: { singleFork: true } }
  }
});
