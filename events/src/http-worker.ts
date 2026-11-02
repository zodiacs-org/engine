import { parentPort, workerData } from 'node:worker_threads';
import { executeQuery } from './search.js';
import { QuerySyntaxError } from './query.js';

try {
  parentPort!.postMessage({ status: 200, body: executeQuery(workerData.query, workerData.options) });
} catch (error) {
  const syntax = error instanceof QuerySyntaxError;
  const invalid = syntax || error instanceof RangeError || error instanceof TypeError;
  parentPort!.postMessage({ status: invalid ? 400 : 500, body: { error: {
    code: syntax ? 'query-syntax' : invalid ? 'invalid-request' : 'internal-error',
    ...(syntax ? { offset: error.offset, syntaxCode: error.code } : {})
  } } });
}
