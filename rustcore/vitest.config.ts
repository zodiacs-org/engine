import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    // Relative engine sources resolve their pinned dependency locally, without
    // installing or changing anything at the repository root.
    alias: {
      "astronomy-engine": fileURLToPath(new URL("./node_modules/astronomy-engine/esm/astronomy.js", import.meta.url))
    }
  },
  test: {
    // The root engine's default Vitest discovery must not pick up tests that
    // require this separate Cargo build. Do not use .test.ts or .spec.ts here.
    include: ["tests/**/*.parity.ts"],
    environment: "node",
    maxWorkers: 2,
    minWorkers: 1
  }
});
