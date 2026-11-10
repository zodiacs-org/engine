import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const projectDirectory = fileURLToPath(new URL("../", import.meta.url));
const resolver = fileURLToPath(new URL("../scripts/register-source.mjs", import.meta.url));
const launcher = fileURLToPath(new URL("../scripts/cli.ts", import.meta.url));
// Fail if any accidentally added fetch reaches the transport, including setup.
const offlineGuard = "data:text/javascript," + encodeURIComponent(
  'globalThis.fetch = () => { throw new Error("CLI must remain offline."); };'
);

/** Real native execution from a CWD other than the companion package root. */
export function invokeCli(argv: readonly string[], timezone = "UTC") {
  const result = spawnSync(process.execPath, ["--import", offlineGuard, "--import", resolver,
    "--experimental-strip-types", launcher, ...argv], {
    cwd: fileURLToPath(new URL("./", import.meta.url)), encoding: "utf8",
    env: { ...process.env, TZ: timezone }, timeout: 60_000, maxBuffer: 32 * 1024 * 1024
  });
  if (result.error) throw result.error;
  return { code: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr };
}
