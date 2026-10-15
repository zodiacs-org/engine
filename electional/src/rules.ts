import { Ajv } from 'ajv';
import { isAlias, parseDocument, visit } from 'yaml';
import { RULE_LIMITS, ruleSchema } from './rule-schema.js';
import type { RuleSet } from './rule-types.js';

export interface RuleIssue {
  readonly path: string;
  readonly code: string;
}

/** Errors intentionally omit supplied values and parser excerpts. */
export class RuleValidationError extends Error {
  readonly issues: readonly RuleIssue[];
  constructor(issues: readonly RuleIssue[]) {
    super('Invalid electional rule set.');
    this.name = 'RuleValidationError';
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

function invalid(path: string, code: string): never {
  throw new RuleValidationError([{ path, code }]);
}

/** Calendar validation only, not a claim of ephemeris coverage. */
export function resolvedInstantMs(value: string): number {
  if (typeof value !== 'string') return invalid('', 'resolved-instant');
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/u.exec(value);
  if (!parts) return invalid('', 'resolved-instant');
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6]);
  const zone = parts[8]!;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]!
    || hour > 23 || minute > 59 || second > 59 || zone === '-00:00'
    || (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) {
    return invalid('', 'resolved-instant');
  }
  const ms = Date.parse(value);
  if (!Number.isSafeInteger(ms)) return invalid('', 'resolved-instant');
  return ms;
}

const ajv = new Ajv({ strict: true, allErrors: false, ownProperties: true });
ajv.addFormat('resolved-instant', (value: string) => {
  try { resolvedInstantMs(value); return true; } catch { return false; }
});
const validate = ajv.compile<RuleSet>(ruleSchema);

/** Copy bounded JSON data before validation; never freeze caller objects. */
function copyJson(value: unknown): unknown {
  let nodes = 0;
  const seen = new WeakSet<object>();
  function copy(input: unknown, depth: number): unknown {
    if (++nodes > RULE_LIMITS.nodes || depth > RULE_LIMITS.depth) return invalid('', 'structure-limit');
    if (input === null || typeof input === 'boolean' || typeof input === 'string') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input !== 'object' || input === null) return invalid('', 'json-data');
    if (seen.has(input)) return invalid('', 'cyclic-data');
    seen.add(input);
    const array = Array.isArray(input);
    const prototype = Object.getPrototypeOf(input);
    if (!array && prototype !== Object.prototype && prototype !== null) return invalid('', 'json-data');
    if (Object.getOwnPropertySymbols(input).length) return invalid('', 'json-data');
    const keys = Object.getOwnPropertyNames(input);
    if (keys.length > RULE_LIMITS.nodes) return invalid('', 'structure-limit');
    const result: Record<string, unknown> | unknown[] = array ? [] : Object.create(null) as Record<string, unknown>;
    if (array && input.length > RULE_LIMITS.nodes) return invalid('', 'structure-limit');
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
      if (!('value' in descriptor) || !descriptor.enumerable) return invalid('', 'json-data');
      if (array && (!/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= input.length)) return invalid('', 'json-data');
      Object.defineProperty(result, key, { value: copy(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    if (array && keys.length - 1 !== input.length) return invalid('', 'json-data');
    seen.delete(input);
    return result;
  }
  return copy(value, 0);
}

function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function validateRuleSet(value: unknown): RuleSet {
  const snapshot = copyJson(value);
  if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > RULE_LIMITS.documentBytes) return invalid('', 'document-size');
  if (!validate(snapshot)) {
    throw new RuleValidationError((validate.errors ?? []).map((error) => ({ path: error.instancePath, code: error.keyword })));
  }
  if (snapshot.activity.trim() !== snapshot.activity) return invalid('/activity', 'whitespace');
  if (resolvedInstantMs(snapshot.range.start) >= resolvedInstantMs(snapshot.range.end)) return invalid('/range', 'range-order');
  const ids = new Set<string>();
  let synastry = false;
  for (let i = 0; i < snapshot.rules.length; i++) {
    const rule = snapshot.rules[i]!;
    if (ids.has(rule.id)) return invalid(`/rules/${i}/id`, 'duplicate-id');
    ids.add(rule.id);
    if (rule.kind === 'applying-aspect' && rule.options.targets.includes(rule.options.body)) return invalid(`/rules/${i}/options/targets`, 'self-aspect');
    synastry ||= rule.kind === 'synastry-aspect';
  }
  if (synastry && !snapshot.natal) return invalid('/natal', 'natal-required');
  if (!synastry && snapshot.natal) return invalid('/natal', 'unused-natal');
  return freeze(snapshot);
}

/** JSON and YAML share one strict validation boundary. No format guessing. */
export function parseRuleSet(text: string, format: 'json' | 'yaml'): RuleSet {
  if (typeof text !== 'string') return invalid('', 'text-required');
  if (Buffer.byteLength(text, 'utf8') > RULE_LIMITS.documentBytes) return invalid('', 'document-size');
  if (format !== 'json' && format !== 'yaml') return invalid('', 'format');
  // YAML's JSON-compatible core scalars support unquoted ISO strings. Disable
  // merge keys and reject aliases, tags, directives, warnings and extra docs.
  // Parse JSON through the same syntax tree to reject duplicate JSON keys too.
  let parsed: unknown;
  try {
    const doc = parseDocument(text, { version: '1.2', schema: 'core', merge: false, uniqueKeys: true, strict: true, prettyErrors: false });
    if (doc.errors.length || doc.warnings.length || doc.directives?.yaml.explicit || doc.directives?.tags.length) return invalid('', 'syntax');
    let forbidden = false;
    let nodes = 0;
    visit(doc, (key, node, path) => {
      if (++nodes > RULE_LIMITS.nodes || path.length > RULE_LIMITS.depth || isAlias(node)
        || (typeof node === 'object' && node !== null
          && (('tag' in node && node.tag) || ('anchor' in node && node.anchor)))) {
        forbidden = true;
        return visit.BREAK;
      }
    });
    if (forbidden) return invalid('', 'yaml-feature-or-limit');
    // JSON.parse checks JSON grammar; YAML AST above detects duplicate keys.
    parsed = format === 'json' ? JSON.parse(text) : doc.toJS({ maxAliasCount: 0 });
  } catch (error) {
    if (error instanceof RuleValidationError) throw error;
    return invalid('', 'syntax');
  }
  return validateRuleSet(parsed);
}
