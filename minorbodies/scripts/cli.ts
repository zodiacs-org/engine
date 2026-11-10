/** Invoke with the companion source resolver; stdout is reserved for results. */
import { runCli } from "../src/cli.ts";

process.exitCode = await runCli(process.argv.slice(2), {
  stdout: text => { process.stdout.write(text); },
  stderr: text => { process.stderr.write(text); }
});
