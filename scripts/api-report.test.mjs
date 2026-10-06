import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { INTERNAL_ENTRIES, buildApiReports, reportName } from "./api-report.mjs";

const made = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A package with a root entry, a second public entry and an internal one. */
const BASE = {
  "index.d.ts": `import { S as Shared } from "./shared.js";
/** The options. A comment the report leaves out. */
interface Options {
    /** How far. */
    readonly step?: number;
    readonly label: string;
}
interface Hidden {
    readonly when: Date;
}
declare const LIMIT = 10;
/** Adds. */
declare function add(a: number, b: number, options?: Options): Hidden;
type Name = "a" | "b";
export { type Name, type Options, LIMIT, Shared, add };
`,
  "b.d.ts": `import { S as Shared } from "./shared.js";
declare function twice(value: Shared): Shared;
export { type Shared as Renamed, twice };
`,
  "internal.d.ts": `declare function secret(): number;
export { secret };
`,
  "shared.d.ts": `interface Shared {
    readonly value: number;
}
export type { Shared as S };
`
};

function makePackage(files = BASE) {
  const dir = mkdtempSync(join(tmpdir(), "api-report-"));
  made.push(dir);
  mkdirSync(join(dir, "dist"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: "@scope/pkg",
    type: "module",
    exports: {
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      "./b": { types: "./dist/b.d.ts", import: "./dist/b.js" },
      "./internal": { types: "./dist/internal.d.ts", import: "./dist/internal.js" }
    }
  }));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, "dist", name), text);
  return dir;
}

function with_(change) {
  const files = { ...BASE };
  change(files);
  return buildApiReports(makePackage(files));
}

describe("the API report", () => {
  it("writes one file for each public entry point and none for the internal ones", () => {
    const reports = buildApiReports(makePackage());
    expect([...reports.keys()]).toEqual(["engine.api.md", "b.api.md"]);
    expect(INTERNAL_ENTRIES).toEqual(["./internal", "./internal/math"]);
    expect(reportName(".")).toBe("engine");
    expect(reportName("./internal/math")).toBe("internal-math");
  });

  it("gives the exported declarations without comments, sorted by name, and what they refer to", () => {
    const root = buildApiReports(makePackage()).get("engine.api.md");
    expect(root).toContain("# @scope/pkg\n");
    expect(root).toContain("## Exported (5)");
    expect(root).not.toContain("A comment the report leaves out");
    expect(root).not.toContain("How far");
    const exported = root.slice(root.indexOf("## Exported"), root.indexOf("## Referenced"));
    const order = ["declare const LIMIT", "type Name", "interface Options", "interface Shared", "declare function add"]
      .map((text) => exported.indexOf(text));
    expect(order.every((at) => at >= 0)).toBe(true);
    // LIMIT, Name, Options, Shared, add: code-point order puts capitals first.
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Hidden is in add's signature but no entry point exports it.
    expect(root).toContain("## Referenced, not exported here (1)");
    expect(root).toContain("// not exported by any entry point\ninterface Hidden {\n    readonly when: Date;\n}");
  });

  it("names the entry points that do export a referenced declaration, and an export under another name", () => {
    const second = buildApiReports(makePackage()).get("b.api.md");
    expect(second).toContain("# @scope/pkg/b\n");
    expect(second).toContain("// exported as Renamed\ninterface Shared {");
    expect(second).not.toContain("## Referenced");
    const root = buildApiReports(makePackage()).get("engine.api.md");
    expect(root).not.toContain("// exported as Shared");
  });

  it("changes when the API changes", () => {
    const base = buildApiReports(makePackage());
    const changed = [
      (f) => { f["index.d.ts"] = f["index.d.ts"].replace("b: number, options", "b: string, options"); },
      (f) => { f["index.d.ts"] = f["index.d.ts"].replace("readonly label: string;", "readonly label?: string;"); },
      (f) => { f["index.d.ts"] = f["index.d.ts"].replace("readonly step?: number;", "step?: number;"); },
      (f) => { f["index.d.ts"] = f["index.d.ts"].replace("readonly when: Date;", "readonly when: string;"); },
      (f) => { f["index.d.ts"] = f["index.d.ts"].replace("LIMIT, Shared, add", "Shared, add"); },
      (f) => { f["index.d.ts"] = f["index.d.ts"].replace('"a" | "b"', '"a" | "b" | "c"'); },
      (f) => { f["shared.d.ts"] = f["shared.d.ts"].replace("readonly value: number;", "readonly value: number;\n    readonly unit: string;"); }
    ];
    for (const change of changed) {
      const reports = with_(change);
      const differs = [...base.keys()].some((name) => reports.get(name) !== base.get(name));
      expect(differs).toBe(true);
    }
  });

  it("does not change when only a comment or the order of declarations changes", () => {
    const base = buildApiReports(makePackage());
    const reworded = with_((f) => { f["index.d.ts"] = f["index.d.ts"].replace("/** Adds. */", "/** Adds two numbers, now documented. */"); });
    expect(reworded).toEqual(base);
    const moved = with_((f) => {
      f["index.d.ts"] = f["index.d.ts"].replace("declare const LIMIT = 10;\n", "").replace("type Name =", "declare const LIMIT = 10;\ntype Name =");
    });
    expect(moved).toEqual(base);
  });

  it("keeps the two release tags, and only them, from the comments", () => {
    const tagged = with_((f) => {
      f["index.d.ts"] = f["index.d.ts"]
        .replace("/** Adds. */", "/**\n * Adds.\n * @deprecated Use another add.\n * @param a the first\n */")
        .replace("declare const LIMIT = 10;", "/** @experimental */\ndeclare const LIMIT = 10;");
    }).get("engine.api.md");
    expect(tagged).toContain("/** @deprecated */\ndeclare function add(");
    expect(tagged).toContain("/** @experimental */\ndeclare const LIMIT = 10;");
    expect(tagged).not.toContain("Use another add");
    expect(tagged).not.toContain("@param");
    // The tag is the promise; its wording is not.
    const reworded = with_((f) => {
      f["index.d.ts"] = f["index.d.ts"]
        .replace("/** Adds. */", "/**\n * Adds.\n * @deprecated Use the other add, from 1.2.\n */")
        .replace("declare const LIMIT = 10;", "/** @experimental */\ndeclare const LIMIT = 10;");
    }).get("engine.api.md");
    expect(reworded).toBe(tagged);
  });

  it("refuses declarations that do not compile", () => {
    const dir = makePackage({ ...BASE, "b.d.ts": "declare function twice(value: Missing): number;\nexport { twice };\n" });
    expect(() => buildApiReports(dir)).toThrow(/do not compile/);
  });

  it("leaves out the entry points README.md calls internal", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    for (const entry of INTERNAL_ENTRIES) expect(readme).toContain(`\`@zodiacs/engine/${entry.slice(2)}\``);
  });
});
