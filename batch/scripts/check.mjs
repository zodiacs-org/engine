import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const [major, minor, patch] = process.versions.node.split(".").map(Number);
if (process.argv.length !== 2 || major !== 22 || minor < 23 || (minor === 23 && patch < 3)) {
  process.stderr.write("Run npm run check on Node >=22.23.3 <23, without additional arguments.\n");
  process.exitCode = 1;
} else {
  // All subprocesses, including test fixtures and npm's read-only dry run,
  // use the selected runtime. No root install or engine build is invoked.
  const env = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}` };
  const steps = [
    ["typecheck", ["node_modules/typescript/bin/tsc", "--project", "tsconfig.json", "--pretty", "false"]],
    ["tests", ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.config.ts"]],
    ["batch build", ["scripts/build.mjs"]],
    ["repository audit", ["scripts/audit.mjs"]],
  ];
  for (const [label, args] of steps) {
    process.stdout.write(`Batch check: ${label}\n`);
    const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: "inherit" });
    if (result.error || result.status !== 0) {
      process.stderr.write(`Batch check failed: ${label}\n`);
      process.exitCode = 1;
      break;
    }
  }
}
