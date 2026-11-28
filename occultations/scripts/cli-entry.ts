import { runCli } from "../src/cli.js";

const result = await runCli(process.argv.slice(2), process.stdin);
process.stdout.write(result.stdout);
process.exitCode = result.exitCode;
