/** Explicit choices for the planned semi-arc solvers. No solver is implied. */
export type DirectionMotion = "direct" | "converse";

/** A key name selects a time conversion, never a different sphere geometry. */
export type TimingKey = "ptolemy" | "naibod" | "solar-equatorial-birth-day";

interface CommonConvention {
  readonly system: "placidus-semiarc";
  readonly key: TimingKey;
}

export type DirectionMotionConvention =
  | { readonly motion: "direct"; readonly converseConstruction?: never }
  | { readonly motion: "converse"; readonly converseConstruction: "placidus-role-swap" };

/**
 * The initial contract admits only the latitude policies documented in SOURCES.
 * Other combinations require independent evidence before extending this union.
 */
export type DirectionConvention = CommonConvention & DirectionMotionConvention & (
  | { readonly mode: "zodiacal"; readonly latitude: "zero-both" }
  | { readonly mode: "mundane"; readonly latitude: "retain-both" }
);

const FIELDS = ["system", "mode", "motion", "latitude", "key"] as const;

/**
 * Validate a JSON-shaped convention with no defaults, then take a frozen copy.
 * Unknown fields are errors so misspelled toggles cannot be silently discarded.
 * This validates choices only; it does not compute or validate a directional arc.
 */
export function parseDirectionConvention(input: unknown): DirectionConvention {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new RangeError("A direction convention must be a plain object.");
  }
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RangeError("A direction convention must be a plain object.");
  }

  // Read data slots only. Accessor values are not JSON convention choices.
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const fields = descriptors.motion?.value === "converse"
    ? [...FIELDS, "converseConstruction"] : FIELDS;
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length || keys.some(key =>
    typeof key !== "string" || !fields.some(field => field === key)
  )) {
    throw new RangeError(
      "Provide system, mode, motion, latitude and key; converse also requires converseConstruction."
    );
  }
  const values: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new RangeError(`Convention ${field} must be an explicit data field.`);
    }
    values[field] = descriptor.value;
  }

  const { system, mode, motion, latitude, key } = values;
  if (system !== "placidus-semiarc") {
    throw new RangeError("Unsupported direction system; use placidus-semiarc.");
  }
  if (motion !== "direct" && motion !== "converse") {
    throw new RangeError("Direction motion must be direct or converse.");
  }
  if (key !== "ptolemy" && key !== "naibod" && key !== "solar-equatorial-birth-day") {
    throw new RangeError("Select an explicit supported timing key.");
  }
  if (motion === "converse" && values.converseConstruction !== "placidus-role-swap") {
    throw new RangeError("Converse requires the explicit placidus-role-swap construction.");
  }
  const direction: DirectionMotionConvention = motion === "direct"
    ? { motion } : { motion, converseConstruction: "placidus-role-swap" };
  if (mode === "zodiacal" && latitude === "zero-both") {
    return Object.freeze({ system, mode, ...direction, latitude, key });
  }
  if (mode === "mundane" && latitude === "retain-both") {
    return Object.freeze({ system, mode, ...direction, latitude, key });
  }
  throw new RangeError(
    "Supported mode/latitude pairs are zodiacal/zero-both and mundane/retain-both."
  );
}

/** Typed entry point; runtime callers receive the same strict validation. */
export function createDirectionConvention(input: DirectionConvention): DirectionConvention {
  return parseDirectionConvention(input);
}
