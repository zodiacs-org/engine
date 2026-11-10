import { CALC_AYANAMSAS } from "../../src/calc.js";
import type { CalcAyanamsa } from "../../src/calc.js";

/** The engine's built-in definitions; no ayanamsa is selected implicitly. */
export const MANSION_AYANAMSAS = CALC_AYANAMSAS;
export type MansionAyanamsa = CalcAyanamsa;
export type MansionZodiac = "tropical" | { readonly sidereal: MansionAyanamsa };

/** Internal validation shared by the at and range request readers. */
export function checkOptions(value: unknown, keys: readonly string[], label: string): void {
  const prototype: unknown = value !== null && typeof value === "object"
    ? Object.getPrototypeOf(value) : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RangeError(`${label} must be a plain options object.`);
  }
  for (const key of Reflect.ownKeys(value as object)) {
    const slot = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !keys.includes(key)
      || !slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError(`${label} takes only ${keys.join(", ")} as data properties.`);
    }
  }
}

/** Snapshot the selection so caller mutation cannot alter an ongoing search. */
export function readZodiac(value: unknown): MansionZodiac {
  if (value === undefined || value === "tropical") return "tropical";
  checkOptions(value, ["sidereal"], "Mansion zodiac");
  const name: unknown = (value as { sidereal?: unknown }).sidereal;
  if (typeof name !== "string" || !MANSION_AYANAMSAS.includes(name as MansionAyanamsa)) {
    throw new RangeError("Mansion sidereal zodiac requires a built-in engine ayanamsa name.");
  }
  return Object.freeze({ sidereal: name as MansionAyanamsa });
}
