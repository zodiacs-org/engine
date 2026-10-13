import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    // The engine is read directly from source; dependencies stay in server/.
    alias: {
      "astronomy-engine": fileURLToPath(new URL("./node_modules/astronomy-engine/esm/astronomy.js", import.meta.url))
    }
  },
  test: {
    include: ["test/**/*.vitest.ts"],
    environment: "node",
    maxWorkers: 2,
    testTimeout: 15_000,
    hookTimeout: 15_000
  }
});
