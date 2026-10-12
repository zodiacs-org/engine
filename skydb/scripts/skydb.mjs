import { requireNode22 } from '../src/identity.mjs';
import { runCli } from '../src/cli.mjs';
try {
  requireNode22();
  await runCli(process.argv.slice(2));
} catch (error) {
  console.error(`skydb: ${error.message}`);
  process.exitCode = 1;
}
