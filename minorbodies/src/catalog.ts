/** Numbered asteroid selectors, including the small-body disambiguating semicolon. */
export const MINOR_BODIES = Object.freeze({
  Chiron: Object.freeze({ name: "Chiron", number: 2060, command: "2060;" }),
  Ceres: Object.freeze({ name: "Ceres", number: 1, command: "1;" }),
  Pallas: Object.freeze({ name: "Pallas", number: 2, command: "2;" }),
  Juno: Object.freeze({ name: "Juno", number: 3, command: "3;" }),
  Vesta: Object.freeze({ name: "Vesta", number: 4, command: "4;" })
} as const);

export type MinorBody = keyof typeof MINOR_BODIES;
export type MinorBodyDefinition = (typeof MINOR_BODIES)[MinorBody];

/** Recognized targets, not a declaration that coefficient data is installed. */
export const MINOR_BODY_NAMES: readonly MinorBody[] = Object.freeze(
  Object.keys(MINOR_BODIES) as MinorBody[]
);

export function isMinorBody(value: unknown): value is MinorBody {
  return typeof value === "string" && Object.hasOwn(MINOR_BODIES, value);
}

/** Exact, case-sensitive names only; no implicit selection of a different object. */
export function minorBodyDefinition(value: unknown): MinorBodyDefinition {
  if (!isMinorBody(value)) throw new RangeError("Unknown minor body.");
  return MINOR_BODIES[value];
}
