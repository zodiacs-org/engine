#!/usr/bin/env node
import { readBoundedText } from '../build/cli-main.js';
import { createElectionalServer } from '../build/http.js';

// Explicit operator policy; loopback only. Library hosts choose their own bind.
try {
  const [policyPath, portText, ...extra] = process.argv.slice(2);
  if (!policyPath || !portText || extra.length || !/^\d+$/u.test(portText)
    || Number(portText) < 1 || Number(portText) > 65535) throw new Error();
  const limits = JSON.parse(await readBoundedText(policyPath, 65536));
  const server = createElectionalServer({ limits });
  server.on('error', () => { process.stderr.write('HTTP listen error.\n'); process.exitCode = 1; });
  server.listen(Number(portText), '127.0.0.1', () => process.stderr.write(`Electional HTTP listening on 127.0.0.1:${Number(portText)}\n`));
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} catch {
  process.stderr.write('Usage: node bin/electional-http.mjs POLICY_JSON PORT\n');
  process.exitCode = 1;
}
