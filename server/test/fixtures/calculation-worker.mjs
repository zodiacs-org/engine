import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parentPort } from 'node:worker_threads';

// Test-only protocol peer. It never calculates, reads credentials or sends
// network traffic. Its optional local counter belongs to the ignored cache.
const options = new URL(import.meta.url).searchParams;
const state = options.get('state');
let generation = 1;
if (state !== null) {
  generation = existsSync(state) ? Number(readFileSync(state, 'utf8')) + 1 : 1;
  writeFileSync(state, String(generation));
}
const mode = options.get('mode');
if (mode === 'startup-fail' || (mode === 'fail-restart' && generation > 1)) {
  parentPort.postMessage({ type: 'startup_failed' });
  parentPort.close();
} else if (mode === 'startup-hang') {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
} else {
  let concurrent = 0;
  const history = [];
  parentPort.on('message', async ({ id, input, requestId }) => {
    concurrent++;
    history.push(requestId);
    if (input.action === 'hang') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    if (input.action === 'crash') throw new Error(input.canary);
    if (input.action === 'exit') process.exit(0);
    if (input.action === 'output') {
      process.stdout.write(input.canary);
      process.stderr.write(input.canary);
    }
    if (input.action === 'delay') await new Promise((resolve) => setTimeout(resolve, input.ms));
    if (input.action === 'error') {
      parentPort.postMessage({ type: 'error', id, kind: input.kind, message: input.canary });
    } else {
      parentPort.postMessage({ type: 'result', id, result: {
        input, history: [...history], concurrent, generation,
        environment: Object.keys(process.env), execArgv: process.execArgv
      } });
    }
    concurrent--;
  });
  parentPort.postMessage({ type: 'ready' });
  if (mode === 'ready-crash') setTimeout(() => process.exit(1), 25);
}
