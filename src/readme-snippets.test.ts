/**
 * The README's *Configurable aspects* and *Declinations and parallels*
 * examples run as pasted: each imports what it uses from "@zodiacs/engine"
 * (here, this checkout's root entry) and builds its own chart. Before
 * 2.0.0-rc.4 both used `chart` without making one, a ReferenceError. The
 * birth in them is synthetic. This checks that the code runs, not its values.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import * as root from "./index.js";

const README = readFileSync(new URL("../README.md", import.meta.url), "utf8");

/** The first ```ts block under the heading `### ${heading}`. */
function snippetUnder(heading: string): string {
  const start = README.indexOf(`\n### ${heading}\n`);
  expect(start, `README has no "### ${heading}"`).toBeGreaterThan(-1);
  const block = /```ts\n([\s\S]*?)\n```/u.exec(README.slice(start));
  expect(block, `no ts block under "### ${heading}"`).not.toBeNull();
  return block![1]!;
}

/** Run a snippet whose one import is a named import from the package root, with the root's exports bound to those names. */
function runSnippet(code: string): unknown[][] {
  const imports = [...code.matchAll(/^import \{([^}]*)\} from "([^"]+)";$/gmu)];
  expect(imports).toHaveLength(1);
  expect(imports[0]![2]).toBe("@zodiacs/engine");
  const names = imports[0]![1]!.split(",").map((name) => name.trim()).filter(Boolean);
  for (const name of names) expect(typeof (root as Record<string, unknown>)[name], `root export ${name}`).toBe("function");
  const body = code.replace(imports[0]![0], "");
  const logged: unknown[][] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void logged.push(args));
  try {
    new Function(...names, `"use strict";\n${body}`)(...names.map((name) => (root as Record<string, unknown>)[name]));
  } finally {
    log.mockRestore();
  }
  return logged;
}

describe("README examples run as pasted", () => {
  it("Configurable aspects", () => {
    const code = snippetUnder("Configurable aspects");
    expect(code).toContain('const chart = natalChart({ utc: "1990-06-15T12:30:00Z" });');
    const logged = runSnippet(code);
    expect(logged).toHaveLength(1);
    expect(Array.isArray(logged[0]![1])).toBe(true);
  });

  it("Declinations and parallels", () => {
    const code = snippetUnder("Declinations and parallels");
    expect(code).toContain('const chart = natalChart({ utc: "1990-06-15T12:30:00Z" });');
    const logged = runSnippet(code);
    expect(logged).toHaveLength(2);
    expect(Array.isArray(logged[1]![0])).toBe(true);
  });
});
