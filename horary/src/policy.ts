export const CONSIDERATION_RULE_IDS = Object.freeze([
  "early-ascendant", "late-ascendant", "saturn-first", "saturn-seventh", "moon-via-combusta",
  "moon-void-of-course"
] as const);

export type ConsiderationRuleId = typeof CONSIDERATION_RULE_IDS[number];

export interface RuleSource {
  readonly id: string;
  readonly tradition: string;
  readonly reference: string;
  readonly url: string;
  readonly locator: string;
}

const lillyUrl = "https://maestrosdelsaber.com/wp-content/uploads/ftp-files/Astrologia/" +
  "Astro%20y%20Religion/Astro%20Lilly%2C%20William%20-%20Christian%20Astrology%20Vol%201%201647.pdf";

function source(id: string, tradition: string, locator: string): RuleSource {
  return Object.freeze({
    id, tradition, reference: "William Lilly, Christian Astrology (first published 1647; linked edition 1659)",
    url: lillyUrl, locator
  });
}

export const CONSIDERATION_SOURCES: Readonly<Record<ConsiderationRuleId, RuleSource>> = Object.freeze({
  "early-ascendant": source("lilly-early-ascendant", "Lilly's Western horary considerations", "Printed p. 122; PDF p. 149"),
  "late-ascendant": source("lilly-late-ascendant", "Lilly's Western horary considerations", "Printed p. 122; PDF p. 149"),
  "saturn-first": source("lilly-saturn-first", "Arabic cautions reported by Lilly", "Printed p. 122; PDF p. 149"),
  "saturn-seventh": source("lilly-saturn-seventh", "Arabic cautions reported by Lilly", "Printed p. 123; PDF p. 150"),
  "moon-via-combusta": source("lilly-via-combusta", "Via Combusta variant reported by Lilly", "Printed p. 122; PDF p. 149"),
  "moon-void-of-course": source("lilly-void-of-course", "Lilly-based last-exact-aspect convention", "Printed p. 112; PDF p. 139")
});

export interface RulePolicyInput {
  readonly rules?: Readonly<Partial<Record<ConsiderationRuleId, boolean>>>;
}

export interface HoraryRulePolicy {
  readonly schema: "horary.rule-policy/v1";
  readonly rules: Readonly<Record<ConsiderationRuleId, boolean>>;
}

function objectWithKeys(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RangeError(`${label} must be an object.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key)) {
      throw new RangeError(`${label} contains an unsupported field.`);
    }
  }
  return value as Record<string, unknown>;
}

/** Every implemented rule defaults on; omitted overrides preserve that default. */
export function createRulePolicy(input: RulePolicyInput = {}): HoraryRulePolicy {
  const options = objectWithKeys(input, ["rules"], "Rule policy options");
  const overrides = options.rules === undefined ? {} :
    objectWithKeys(options.rules, CONSIDERATION_RULE_IDS, "Rule toggles");
  const rules = {} as Record<ConsiderationRuleId, boolean>;
  for (const id of CONSIDERATION_RULE_IDS) {
    const supplied = Object.hasOwn(overrides, id);
    const toggle = supplied ? overrides[id] : true;
    if (typeof toggle !== "boolean") throw new RangeError("Rule toggles must be booleans.");
    rules[id] = toggle;
  }
  return Object.freeze({ schema: "horary.rule-policy/v1", rules: Object.freeze(rules) });
}

/** Revalidate complete policy snapshots, including JSON-restored snapshots. */
export function validateRulePolicy(value: HoraryRulePolicy): HoraryRulePolicy {
  const policy = objectWithKeys(value, ["schema", "rules"], "Rule policy");
  if (policy.schema !== "horary.rule-policy/v1") throw new RangeError("Unsupported rule policy schema.");
  const rules = objectWithKeys(policy.rules, CONSIDERATION_RULE_IDS, "Rule toggles");
  if (!CONSIDERATION_RULE_IDS.every((id) => Object.hasOwn(rules, id))) {
    throw new RangeError("A rule policy snapshot must contain every implemented rule toggle.");
  }
  return createRulePolicy({ rules });
}
