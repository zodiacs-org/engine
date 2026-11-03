/**
 * Check L8 of docs/evidence/1.1.0-rc.2-20261102/lite/PREREGISTRATION.md, on
 * the source: src/lite.ts exports the 51 names of scripts/lite-entry.mjs, 27
 * values and 24 types, read with the TypeScript checker as the API report
 * reads a declaration file, and its parts the values of their own lists. The
 * export smoke test holds the build's run-time names and dist/lite.d.ts to
 * the same lists. At source level each name is the module's own object, since
 * the parts re-export the root's, the techniques entry's and src/sect.ts's
 * modules; the copies are the build's (the smoke test, L5).
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LITE_NAMES, checkLiteNames, declaredNames, liteNames } from "../scripts/lite-entry.mjs";
import * as declination from "./declination.js";
import * as lite from "./lite.js";
import * as composite from "./lite/composite.js";
import * as declinations from "./lite/declinations.js";
import * as dignities from "./lite/dignities.js";
import * as sect from "./lite/sect.js";

describe("the lite entry's source", () => {
  it("exports the 51 names of L8, 27 values and 24 types", () => {
    const source = declaredNames(fileURLToPath(new URL("./lite.ts", import.meta.url)));
    expect(source).toEqual(liteNames());
    expect(() => checkLiteNames({ source, runtime: Object.keys(lite) })).not.toThrow();
  });

  it("takes each value from its part, and each part's from its one module", () => {
    const parts = { declinations, sect, composite, dignities };
    expect(() => checkLiteNames({ parts: { declinations: Object.keys(declinations), sect: Object.keys(sect), composite: Object.keys(composite), dignities: Object.keys(dignities) } })).not.toThrow();
    for (const [part, module] of Object.entries(parts)) {
      for (const name of LITE_NAMES[part as keyof typeof parts].values) {
        expect((lite as Record<string, unknown>)[name], `${part} ${name}`).toBe((module as Record<string, unknown>)[name]);
      }
    }
    // Not the deprecated names, nor the helper the root keeps to itself.
    for (const name of ["DECLINATION_ORB", "DECLINATION_ORB_LUMINARY", "MAX_DECLINATION_BODIES", "chartBodyDeclinations"]) {
      expect(name in declination, name).toBe(true);
      expect(name in lite, name).toBe(false);
    }
  });
});
