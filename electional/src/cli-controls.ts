import { parseDocument } from 'yaml';
import { checkedSearchOptions } from './search.js';
import { RULE_LIMITS } from './rule-schema.js';
import type { ElectionalRule } from './rule-types.js';
import type { StreamOptions } from './stream.js';

/** Transport controls are separate from selection conventions. JSON only. */
export function parseCliControls(text: string, rules: readonly ElectionalRule[]): StreamOptions {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > RULE_LIMITS.documentBytes) {
    throw new RangeError('Invalid controls document.');
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
    const doc = parseDocument(text, { uniqueKeys: true, strict: true, prettyErrors: false });
    if (doc.errors.length || doc.warnings.length) throw new Error();
  } catch { throw new RangeError('Invalid controls JSON.'); }
  const chunkKeys = ['chunkMs', 'maxChunks', 'maxChunkEvaluations', 'maxChunkSkySamples', 'maxFrameBytes'] as const;
  const searchKeys = ['stepMs', 'lookaheadMs', 'maxEvaluations', 'maxSkySamples', 'eclipse'];
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => ![...chunkKeys, ...searchKeys].includes(key))) {
    throw new RangeError('Invalid controls fields.');
  }
  const value = input as Record<string, unknown>;
  for (const key of chunkKeys) {
    if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 1) throw new RangeError('Invalid chunk controls.');
  }
  const { chunkMs, maxChunks, maxChunkEvaluations, maxChunkSkySamples, maxFrameBytes, ...search } = value;
  const checked = checkedSearchOptions(search as unknown as StreamOptions, rules);
  return Object.freeze({ ...checked, chunkMs: chunkMs as number, maxChunks: maxChunks as number,
    maxChunkEvaluations: maxChunkEvaluations as number, maxChunkSkySamples: maxChunkSkySamples as number, maxFrameBytes: maxFrameBytes as number });
}
