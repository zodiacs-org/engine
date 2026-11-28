// Self-contained loopback request using the existing condition endpoint.
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createElectionalServer, RULE_LIMITS } from '../build/index.js';
import { readBoundedText } from '../build/cli-main.js';

const read = file => readBoundedText(fileURLToPath(new URL(file, import.meta.url)), RULE_LIMITS.documentBytes);
const limits = JSON.parse(await read('http-policy.json'));
const controls = JSON.parse(await read('http-controls.json'));
const rules = await read('synthetic-hours.yaml');
const server = createElectionalServer({ limits });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const outputError = () => {};
process.stdout.on('error', outputError);
try {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/electional/search`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'yaml', rules, controls }), signal: AbortSignal.timeout(limits.deadlineMs),
  });
  if (!response.ok) throw new Error('Condition request failed.');
  const text = await response.text();
  const terminal = JSON.parse(text.trimEnd().split('\n').at(-1));
  if (terminal.type !== 'end') throw new Error('Incomplete condition transport.');
  await new Promise((resolve, reject) => process.stdout.write(text, error => error ? reject(error) : resolve()));
  process.exitCode = { complete: 0, unresolved: 2, refused: 3 }[terminal.status];
} catch {
  console.error('{"error":"example-failed"}'); process.exitCode = 1;
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  process.stdout.off('error', outputError);
}
