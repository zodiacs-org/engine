// scripts/verify-no-dashes.mjs's rules on text made up here: which part of a
// changelog it reads, and how it reports a dash.
import { describe, expect, it } from "vitest";

import { DOCUMENTS, activeChangelog, dashesIn } from "./verify-no-dashes.mjs";

describe("the no-dashes check", () => {
  const changelog = ["# Changelog", "", "## 3.0.0 (candidate)", "- new, with no dash", "", "## 2.1.0 (cut 2026-11-23)", "- old \u2014 kept", "## 2.0.0", "- older \u2013 kept"].join("\n");

  it("reads a changelog down to its first entry for a carried version, and the whole of it where none is carried", () => {
    expect(activeChangelog(changelog, ["2.1.0", "2.0.0"])).toEqual(["# Changelog", "", "## 3.0.0 (candidate)", "- new, with no dash", ""]);
    expect(activeChangelog(changelog, ["2.0.0"])).toHaveLength(7);
    expect(activeChangelog(changelog, [])).toHaveLength(9);
  });

  it("reports each en and em dash with its place, and nothing in text without one", () => {
    expect(dashesIn("CHANGELOG.md", changelog.split("\n"))).toEqual([
      'CHANGELOG.md:7:7: U+2014 in "- old \u2014 kept"',
      'CHANGELOG.md:9:9: U+2013 in "- older \u2013 kept"'
    ]);
    expect(dashesIn("x.md", ["a - b, c-d: e (f) to g", "U+2010 ‐ and the minus − are not dashes it checks"])).toEqual([]);
  });

  it("names the documents the house rule covers", () => {
    expect(DOCUMENTS).toEqual(["README.md", "CHANGELOG.md", "LICENSING.md", "NOTICE", "docs/calc.md", "skills/zodiacs-compute/SKILL.md", "tools/wheel/README.md"]);
  });
});
