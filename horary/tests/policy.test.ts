import { describe, expect, it } from "vitest";
import { CONSIDERATION_RULE_IDS, CONSIDERATION_SOURCES, createRulePolicy } from "../src/index.js";
import type { RulePolicyInput } from "../src/index.js";

describe("consideration rule policy", () => {
  it("enables each sourced rule by default", () => {
    const policy = createRulePolicy();
    expect(policy).toEqual({ schema: "horary.rule-policy/v1", rules: {
      "early-ascendant": true, "late-ascendant": true, "saturn-first": true,
      "saturn-seventh": true, "moon-via-combusta": true, "moon-void-of-course": true
    } });
    expect(Object.keys(CONSIDERATION_SOURCES)).toEqual([...CONSIDERATION_RULE_IDS]);
    for (const source of Object.values(CONSIDERATION_SOURCES)) {
      expect(source.id).toMatch(/^lilly-/);
      expect(source.tradition).toBeTruthy();
      expect(source.reference).toContain("William Lilly");
      expect(source.url).toMatch(/^https:/);
      expect(source.locator).toContain("Printed p.");
      expect(Object.isFrozen(source)).toBe(true);
    }
  });

  it.each(CONSIDERATION_RULE_IDS)("can disable just %s", (id) => {
    const policy = createRulePolicy({ rules: { [id]: false } });
    expect(policy.rules[id]).toBe(false);
    for (const other of CONSIDERATION_RULE_IDS.filter((rule) => rule !== id)) {
      expect(policy.rules[other]).toBe(true);
    }
  });

  it("returns frozen snapshots independent of caller options", () => {
    const input = { rules: { "early-ascendant": false } };
    const policy = createRulePolicy(input);
    input.rules["early-ascendant"] = true;
    expect(policy.rules["early-ascendant"]).toBe(false);
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.rules)).toBe(true);
    expect(() => Object.assign(policy.rules, { "saturn-first": false })).toThrow(TypeError);
  });

  it.each([
    null, [], true, { unknown: true }, { rules: null }, { rules: [] },
    { rules: { "early-ascendent": false } }, { rules: { "saturn-first": "false" } },
    { rules: { "late-ascendant": 0 } }, { rules: { "moon-via-combusta": undefined } },
    { rules: { [Symbol("toggle")]: false } }
  ])("refuses malformed options %j", (input) => {
    expect(() => createRulePolicy(input as RulePolicyInput)).toThrow(RangeError);
  });
});
