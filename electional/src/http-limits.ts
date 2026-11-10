import { parseDocument } from 'yaml';
import { parseCliControls } from './cli-controls.js';
import { parseRuleSet, resolvedInstantMs } from './rules.js';
import type { RuleSet } from './rule-types.js';
import type { StreamOptions } from './stream.js';

/** Operator policy, never taken from a request. All byte limits include UTF-8. */
export interface HttpLimits {
  readonly maxConcurrentSearches: number;
  readonly deadlineMs: number;
  readonly maxRequestBytes: number;
  readonly maxResponseBytes: number;
  readonly maxFrameBytes: number;
  readonly maxRangeMs: number;
  readonly minStepMs: number;
  readonly maxLookaheadMs: number;
  readonly maxChunkMs: number;
  readonly maxChunks: number;
  readonly maxEvaluations: number;
  readonly maxSkySamples: number;
  readonly maxChunkEvaluations: number;
  readonly maxChunkSkySamples: number;
}
const keys: readonly (keyof HttpLimits)[] = ['maxConcurrentSearches', 'deadlineMs', 'maxRequestBytes',
  'maxResponseBytes', 'maxFrameBytes', 'maxRangeMs', 'minStepMs', 'maxLookaheadMs', 'maxChunkMs',
  'maxChunks', 'maxEvaluations', 'maxSkySamples', 'maxChunkEvaluations', 'maxChunkSkySamples'];

export class HttpFailure extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
export function checkedHttpLimits(input: HttpLimits): HttpLimits {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== keys.length
    || Object.keys(input).some(key => !keys.includes(key as keyof HttpLimits))
    || keys.some(key => !Number.isSafeInteger(input[key]) || input[key] < (key === 'maxLookaheadMs' ? 0 : 1))
    || input.deadlineMs > 2_147_483_647 || input.maxFrameBytes < 256 || input.maxResponseBytes < 256) {
    throw new RangeError('Expected explicit bounded HTTP policy.');
  }
  return Object.freeze({ ...input });
}
export interface HttpSearchRequest {
  readonly ruleSet: RuleSet;
  readonly controls: StreamOptions;
}

/** JSON envelope with an explicit JSON/YAML rule document and JSON controls. */
export function parseHttpSearch(text: string, limits: HttpLimits): HttpSearchRequest {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > limits.maxRequestBytes) {
    throw new HttpFailure(413, 'request-too-large');
  }
  try {
    // JSON grammar plus duplicate keys at every depth, including controls.
    const input: unknown = JSON.parse(text);
    const doc = parseDocument(text, { uniqueKeys: true, strict: true, prettyErrors: false });
    if (doc.errors.length || doc.warnings.length || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
    const value = input as Record<string, unknown>;
    if (Object.keys(value).length !== 3 || Object.keys(value).some(k => !['format', 'rules', 'controls'].includes(k))
      || (value.format !== 'json' && value.format !== 'yaml') || typeof value.rules !== 'string') throw new Error();
    const ruleSet = parseRuleSet(value.rules, value.format);
    const controls = parseCliControls(JSON.stringify(value.controls), ruleSet.rules);
    const caps = { chunkMs: limits.maxChunkMs, lookaheadMs: limits.maxLookaheadMs,
      maxChunks: limits.maxChunks, maxEvaluations: limits.maxEvaluations, maxSkySamples: limits.maxSkySamples,
      maxChunkEvaluations: limits.maxChunkEvaluations, maxChunkSkySamples: limits.maxChunkSkySamples,
      maxFrameBytes: limits.maxFrameBytes };
    if (resolvedInstantMs(ruleSet.range.end) - resolvedInstantMs(ruleSet.range.start) > limits.maxRangeMs
      || controls.stepMs < limits.minStepMs
      || Object.entries(caps).some(([key, maximum]) => controls[key as keyof typeof caps] > maximum)) {
      throw new HttpFailure(422, 'policy-limit');
    }
    return Object.freeze({ ruleSet, controls });
  } catch (error) {
    if (error instanceof HttpFailure) throw error;
    throw new HttpFailure(400, 'invalid-request');
  }
}
