import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: ".cache/vite",
  test: {
    // Keep calendar's optional test dependencies out of the parent test scan.
    include: ["test/**/*.calendar-test.ts"],
    maxWorkers: 2
  }
});
