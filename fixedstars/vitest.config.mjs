import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    // The relative engine source imports resolve their dependency here. This
    // avoids installing or changing anything in the parent engine checkout.
    alias: {
      "astronomy-engine": fileURLToPath(new URL("./node_modules/astronomy-engine/esm/astronomy.js", import.meta.url))
    }
  },
  test: {
    // Keep standalone tests out of the parent engine's default discovery.
    include: ["tests/**/*.fixedstars.{ts,mjs}"],
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1
  }
});

