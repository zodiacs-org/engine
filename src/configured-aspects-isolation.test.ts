import { describe, expect, it, vi } from "vitest";

// Every module that imports the classic aspect table sees one whose orbs are
// all 0. An aspect policy is built from its own table, so it is unchanged.
vi.mock("./aspects.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./aspects.js")>();
  return { ...original, ASPECTS: Object.freeze(original.ASPECTS.map((aspect) => Object.freeze({ ...aspect, orb: 0 }))) };
});

const { ASPECTS } = await import("./aspects.js");
const { createAspectPolicy, findConfiguredAspects } = await import("./configured-aspects.js");

describe("an aspect policy and the classic ASPECTS table", () => {
  it("does not consult the table, whatever it holds", () => {
    expect(ASPECTS.map((aspect) => aspect.orb as number)).toEqual([0, 0, 0, 0, 0]);
    const configured = createAspectPolicy();
    expect(configured.aspects[0]?.orb.applying).toBe(8);
    const found = findConfiguredAspects([{ body: "Mars", lon: 0, speed: 1 }, { body: "Saturn", lon: 5, speed: 1 }], configured).aspects;
    expect(found).toHaveLength(1);
  });
});
