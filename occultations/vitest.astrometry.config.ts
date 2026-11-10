import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: ".cache/vite-astrometry",
  resolve: { alias: { "astronomy-engine": fileURLToPath(import.meta.resolve("astronomy-engine")) } },
  test: { include: ["test/astrometry.extended.ts"], pool: "forks", maxWorkers: 1, minWorkers: 1 }
});
