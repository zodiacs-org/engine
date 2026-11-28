import { get } from 'node:http';

// Probe the configured listener without loading the engine or credentials.
// A total deadline bounds a peer that keeps sending bytes without finishing.
const timeoutMs = 2000;
const maxBytes = 65_536;
let request;
let finished = false;
const timer = setTimeout(() => finish(false), timeoutMs);
function finish(ready) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  request?.destroy();
  process.exitCode = ready ? 0 : 1;
}

try {
  const configuredHost = process.env.HOST ?? '127.0.0.1';
  const host = configuredHost === '0.0.0.0' ? '127.0.0.1'
    : configuredHost === '::' ? '::1' : configuredHost;
  const port = process.env.PORT ?? '3000';
  if (!host || /\s/u.test(host) || !/^\d{1,5}$/u.test(port)
    || Number(port) < 1 || Number(port) > 65535) throw new Error();
  request = get({ hostname: host, port: Number(port), path: '/readyz', agent: false }, (response) => {
    if (response.statusCode !== 200) {
      response.destroy();
      finish(false);
      return;
    }
    const chunks = [];
    let bytes = 0;
    response.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        response.destroy();
        finish(false);
      } else chunks.push(chunk);
    });
    response.on('error', () => finish(false));
    response.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        finish(body?.data?.status === 'ready' && body?.engine?.name === '@zodiacs/engine'
          && Array.isArray(body.receipts) && body.receipts.length === 0);
      } catch {
        finish(false);
      }
    });
  });
  request.on('error', () => finish(false));
} catch {
  finish(false);
}
