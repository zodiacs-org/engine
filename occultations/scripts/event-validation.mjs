import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length !== 1 || !["development", "held-out", "all"].includes(args[0])) {
  throw new Error("Usage: node scripts/event-validation.mjs development|held-out|all");
}
await build({
  absWorkingDir: fileURLToPath(new URL("../", import.meta.url)),
  entryPoints: ["scripts/event-validation-entry.ts"], outfile: ".generated/event-validation.mjs",
  bundle: true, platform: "node", format: "esm", target: "node22", legalComments: "eof",
  alias: { "astronomy-engine": fileURLToPath(import.meta.resolve("astronomy-engine")) }
});
const child = spawnSync(process.execPath,
  [fileURLToPath(new URL("../.generated/event-validation.mjs", import.meta.url)), ...args], { stdio: "inherit" });
if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
