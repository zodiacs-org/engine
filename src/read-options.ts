/**
 * Internal: the options reader of the techniques, timing and Vedic entry
 * points. Each of their functions names the options it takes, and a key it
 * does not name is refused rather than ignored, so a misspelt option (say
 * `timescale` for `timeScale`) is a RangeError and not a silently different
 * answer.
 */

/**
 * Copy an options argument's own data properties, refusing anything but a
 * plain object of the named keys. `undefined` values count as absent.
 */
export function readOptions(
  value: unknown,
  allowed: readonly string[],
  label: string
): Readonly<Record<string, unknown>> {
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  if (value === undefined) return out;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RangeError(`${label} must be an options object.`);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RangeError(`${label} must be a plain options object.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key)) {
      throw new RangeError(`${label} has an unknown option: ${String(key)}.`);
    }
    const slot = Object.getOwnPropertyDescriptor(value, key);
    if (!slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError(`${label} must contain only plain data properties.`);
    }
    if (slot.value !== undefined) out[key] = slot.value as unknown;
  }
  return out;
}
