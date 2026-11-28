import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Keep these checks out of the engine's default test discovery. Its CI
    // installs only the root dependencies and runs before building dist/.
    include: ["test/**/*.vitest.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } }
  }
});
