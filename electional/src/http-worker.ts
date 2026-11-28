import { parentPort, workerData } from 'node:worker_threads';
import { loadSearchDependencies } from './search.js';
import { streamElectional } from './stream.js';
import type { HttpSearchRequest } from './http-limits.js';

// This module is a dedicated worker entry, never imported by the library entry.
if (!parentPort) throw new Error('Expected a dedicated HTTP search worker.');
const port = parentPort;
try {
  const request = workerData as HttpSearchRequest;
  const dependencies = await loadSearchDependencies();
  for await (const frame of streamElectional(request.ruleSet, dependencies, request.controls)) {
    // Install the listener before posting: the host can acknowledge immediately.
    const accepted = new Promise<void>(resolve => port.once('message', () => resolve()));
    port.postMessage({ type: 'frame', json: JSON.stringify(frame), terminal: frame.type === 'end' });
    await accepted;
  }
} catch {
  // Neither exception messages nor submitted data belong in transport errors.
  port.postMessage({ type: 'error' });
} finally { port.close(); }
