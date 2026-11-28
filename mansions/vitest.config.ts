import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    // Engine source lives outside this project. Resolve its pinned dependency
    // here so no install or configuration change is needed at the repo root.
    alias: {
      "astronomy-engine": fileURLToPath(import.meta.resolve("astronomy-engine"))
    }
  },
  test: {
    include: ["test/**/*.test.ts"],
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1
  }
});
