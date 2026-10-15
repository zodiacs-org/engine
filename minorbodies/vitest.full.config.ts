import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: ".cache/vite-full",
  resolve: { alias: { "astronomy-engine": fileURLToPath(new URL("./node_modules/astronomy-engine/esm/astronomy.js", import.meta.url)) } },
  test: {
    include: ["tests/full-accuracy.test.ts", "tests/full-adapter.test.ts", "tests/full-stations.test.ts", "tests/full-retrogrades.test.ts", "tests/full-ingresses.test.ts", "tests/full-cli.test.ts", "tests/full-final-accuracy.test.ts", "tests/full-final-events.test.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } }
  }
});
