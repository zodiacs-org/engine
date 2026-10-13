import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: ".cache/vite",
  resolve: {
    alias: {
      "astronomy-engine": fileURLToPath(import.meta.resolve("astronomy-engine")),
      // Vitest's older loader strips the prefix from this newer builtin. The
      // test bridge loads the real module through Node's native require.
      "node:sqlite": fileURLToPath(new URL("./test/native-sqlite.mjs", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    pool: "forks",
    maxWorkers: 2,
    minWorkers: 1,
  },
});
