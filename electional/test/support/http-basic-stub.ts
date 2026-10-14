import golden from '../fixtures/composition-windows.json';
import { clipIntervals, subtractIntervals } from '../../src/intervals.js';
import type { BasicRule, RuleWindowResult } from '../../src/basic-rules.js';
import type { ClockWindow, EngineReceipt } from '../../src/adapter-contract.js';

export const receipt: EngineReceipt = { schema: 'http-hand-derived-contract', request: {}, instants: [{ clock: 'utc' }],
  conventions: ['integer-sets;no-astronomical-reference'],
  engine: { name: 'stub', version: '1.0.0', ephemeris: { name: 'none', version: '1.0.0' } } };

// Only transport tests bundle this delegate in place of the real evaluator.
// The actual stream, coordinator, composition and worker protocol are retained.
export function evaluateBasicRule(rule: BasicRule, window: ClockWindow): RuleWindowResult {
  if (rule.id === 'crash' || (rule.id === 'crash-after-first' && window.startMs >= 25)) throw new Error('private-source-message');
  if (rule.id === 'block' || (rule.id === 'block-after-first' && window.startMs >= 25)) {
    // Deliberately synchronous to verify the *host* can terminate native work.
    for (;;) { /* no worker event-loop checkpoints */ }
  }
  const row = golden.rules.find(r => r.id === rule.id);
  const span = ([startMs, endMs]: readonly number[]) => ({ startMs: startMs!, endMs: endMs! });
  const satisfied = row ? clipIntervals(row.satisfied.map(span), window) : [window];
  const unknown = row ? clipIntervals(row.unknown.map(span), window) : [];
  const covered = subtractIntervals([window], unknown);
  return { rule, window, status: unknown.length ? 'unresolved' : 'complete', satisfied,
    failed: subtractIntervals(covered, satisfied), covered,
    unresolved: unknown.map(w => ({ ...w, reason: 'hand-derived-unknown' })), evaluations: 1,
    receipts: [receipt], searches: [], explanation: 'Independent hand-derived integer membership.', completeness: 'source-scan-assumptions' };
}
