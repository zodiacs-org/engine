import { createHash } from 'node:crypto';

export const assert = (condition, message) => { if (!condition) throw new Error(message); };
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function canonical(value) {
  const ancestors = new Set(); let nodes = 0;
  function visit(item, depth) {
    assert(++nodes <= 200000 && depth <= 64, 'JSON structure exceeds limits');
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return JSON.stringify(item);
    if (typeof item === 'number') { assert(Number.isFinite(item), 'Nonfinite JSON number'); return JSON.stringify(item); }
    assert(item && typeof item === 'object' && !ancestors.has(item), 'Non-JSON value or cycle');
    ancestors.add(item);
    let result;
    if (Array.isArray(item)) {
      const keys = Reflect.ownKeys(item);
      assert(keys.length === item.length + 1 && keys.every(k => typeof k === 'string' && (k === 'length' || /^(0|[1-9][0-9]*)$/.test(k))), 'Sparse or decorated JSON array');
      const parts = [];
      for (let i = 0; i < item.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(i));
        assert(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'JSON array contains a hole or accessor');
        parts.push(visit(descriptor.value, depth + 1));
      }
      result = '[' + parts.join(',') + ']';
    } else {
      assert(Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null, 'Expected plain JSON object');
      const keys = Reflect.ownKeys(item);
      assert(keys.every(k => typeof k === 'string'), 'JSON symbol key');
      const parts = [];
      for (const key of keys.sort()) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        assert(descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'JSON object contains hidden data or accessor');
        parts.push(JSON.stringify(key) + ':' + visit(descriptor.value, depth + 1));
      }
      result = '{' + parts.join(',') + '}';
    }
    ancestors.delete(item); return result;
  }
  return visit(value, 0);
}
export const digest = value => sha256(canonical(value));
export const equal = (a, b) => canonical(a) === canonical(b);
export const clone = value => JSON.parse(canonical(value));
export function exactKeys(value, keys, label) {
  assert(value && Object.getPrototypeOf(value) === Object.prototype, label + ' must be a plain object');
  assert(equal(Object.keys(value).sort(), [...keys].sort()), label + ' has missing or unknown fields');
}
export function circularDifference(a, b) { return ((a - b + 540) % 360 + 360) % 360 - 180; }
export function statistics(values) {
  assert(values.length > 0 && values.every(Number.isFinite), 'Cannot summarize missing/nonfinite observations');
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return { count: sorted.length, median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(0.95 * sorted.length) - 1], max: sorted.at(-1) };
}
