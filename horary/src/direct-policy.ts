import type { RuleSource } from "./policy.js";

export const DIRECT_PERFECTION_SOURCE: RuleSource = Object.freeze({
  id: "lilly-direct-contact;project-continuity-checks",
  tradition: "Lilly's direct applications, with explicit project continuity checks",
  reference: "William Lilly, Christian Astrology (first published 1647; linked edition 1659)",
  url: "https://pdfcoffee.com/william-lilly-christian-astrology-volume-1-pdf-free.html",
  locator: "Printed pp. 109-110 (refrenation) and 124-125 (direct conjunction and aspects)"
});

export const DIRECT_EVENT_METHOD = Object.freeze({
  engineSearch: "searchLongitudeCrossingsWith;sign-boundaries-and-transformed-speed-zero",
  engineSpeed: "longitudeSpeed;engine-central-difference",
  stationTransform: "atan(speed)*90/pi;zero-target",
  verification: "sampled;not-proven-complete",
  budgetUnit: "longitude-or-speed-provider-calls;includes-evidence-probes",
  limitations: Object.freeze([
    "The event scan inherits the aspect scan's smooth-motion, step and clock limitations.",
    "Speed zeros use a monotone bounded transform; circular offset rounding can treat extremely small speeds as zero.",
    "Station evidence concerns the engine's sampled longitude speed, not an independently verified physical station.",
    "Provider Dates stay inside the horizon; longitudeSpeed internally samples on either side of its Date and can reach outside it.",
    "Side probes stay inside the horizon and between neighbouring roots; a missing side, zero plateau or touch requires review.",
    "The solver merges roots less than one second apart for each target. Nearby events can remain unresolved.",
    "Event/contact times within twice the stated root resolution are treated as coincident, without inventing an order.",
    "Keeping original signs and flagging every station are configurable project checks, not Lilly's complete perfection criteria.",
    "Reception, house strength, prohibition, frustration and refrenation eligibility are not decided here.",
    "Current chart geometry and caller longitude/speed providers are not authenticated against each other."
  ])
} as const);

export interface DirectPerfectionPolicyInput {
  readonly directAspect?: boolean;
  readonly signChanges?: boolean;
  readonly stations?: boolean;
  /** Global event-provider-call budget, separate from the aspect search budget. */
  readonly maxSamples?: number;
}
export interface HoraryDirectPolicy {
  readonly schema: "horary.direct-policy/v1";
  readonly directAspect: boolean;
  readonly signChanges: boolean;
  readonly stations: boolean;
  readonly maxSamples: number;
}
const KEYS = ["directAspect", "signChanges", "stations", "maxSamples"] as const;
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value) as typeof Object.prototype)) {
    throw new RangeError("Direct perfection policy requires ordinary objects.");
  }
  for (const key of Reflect.ownKeys(value)) {
    const slot = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !keys.includes(key) || !slot || !("value" in slot) || !slot.enumerable) {
      throw new RangeError("Direct perfection policy has unsupported fields or non-data slots.");
    }
  }
  return value as Record<string, unknown>;
}
export function createDirectPerfectionPolicy(input: DirectPerfectionPolicyInput = {}): HoraryDirectPolicy {
  const options = object(input, KEYS);
  const toggle = (key: string) => {
    const value = options[key] === undefined ? true : options[key];
    if (typeof value !== "boolean") throw new RangeError("Direct perfection toggles must be boolean.");
    return value;
  };
  const maxSamples = options.maxSamples === undefined ? 20_000 : options.maxSamples;
  if (typeof maxSamples !== "number" || !Number.isInteger(maxSamples) || maxSamples < 1 || maxSamples > 1_000_000) {
    throw new RangeError("Direct event budget must be a positive integer at most 1,000,000.");
  }
  return Object.freeze({ schema: "horary.direct-policy/v1", directAspect: toggle("directAspect"),
    signChanges: toggle("signChanges"), stations: toggle("stations"), maxSamples });
}
export function validateDirectPerfectionPolicy(input: HoraryDirectPolicy): HoraryDirectPolicy {
  const options = object(input, ["schema", ...KEYS]);
  if (options.schema !== "horary.direct-policy/v1" || KEYS.some(key => !Object.hasOwn(options, key) || options[key] === undefined)) {
    throw new RangeError("Unsupported or incomplete direct perfection policy snapshot.");
  }
  const { schema: _schema, ...rest } = options;
  return createDirectPerfectionPolicy(rest as DirectPerfectionPolicyInput);
}
