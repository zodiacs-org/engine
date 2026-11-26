// scripts/verify-no-dashes.mjs's rules on text made up here: which part of a
// changelog it reads, how it reports a dash, and, in a repository made up in a
// temporary folder, that a candidate's own entry is read before and after the
// commit that adds its archive, until the base branch carries it.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { DOCUMENTS, activeChangelog, carriedOn, check, dashesIn } from "./verify-no-dashes.mjs";

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
    expect(DOCUMENTS).toEqual([
      "README.md",
      "CHANGELOG.md",
      "LICENSING.md",
      "NOTICE",
      "docs/calc.md",
      "docs/guide.md",
      "docs/de440.md",
      "docs/comparison.md",
      "skills/zodiacs-compute/SKILL.md",
      "tools/wheel/README.md"
    ]);
  });
});

describe("a candidate's own changelog entry", () => {
  const root = `${mkdtempSync(join(tmpdir(), "no-dashes-"))}/`;
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", ["-c", "user.name=no-dashes test", "-c", "user.email=no-dashes-test@example.invalid", "-c", "commit.gpgsign=false", ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  const archives = (...versions) => `${JSON.stringify({ archives: versions.map((version) => ({ version, file: `zodiacs-engine-${version}.tgz` })) }, null, 2)}\n`;
  const write = (file, text) => writeFileSync(join(root, file), text);
  const OLD = "## 2.1.0 (cut 2026-11-23)\n\n- shipped \u2014 kept as it shipped\n";
  const NEW = "## 3.0.0 (cut 2026-11-27)\n\n- new \u2014 with an em dash\n\n";

  it("is read after the pull request's own commit adds its archive, and left as it shipped once the base branch carries it", () => {
    git("init", "-q", "-b", "main");
    mkdirSync(join(root, "artifacts"));
    write("artifacts/archives.json", archives("2.1.0"));
    write("CHANGELOG.md", `# Changelog\n\n${OLD}`);
    git("add", "-A");
    git("commit", "-q", "-m", "2.1.0 carried");
    git("checkout", "-q", "-b", "candidate");
    write("CHANGELOG.md", `# Changelog\n\n${NEW}${OLD}`);
    git("commit", "-q", "-am", "Cut 3.0.0");
    // Before the archive: the base carries 2.1.0 alone.
    expect(carriedOn("main", root)).toEqual(["2.1.0"]);
    expect(check({ root, base: "main" }).found).toEqual(['CHANGELOG.md:5:7: U+2014 in "- new \u2014 with an em dash"']);
    // After the commit that carries the 3.0.0 archive, archives.json in the checkout names 3.0.0 too. Read with the
    // checkout's list, the entry would be taken out of the check; read with the base branch's, it stays in.
    write("artifacts/archives.json", archives("2.1.0", "3.0.0"));
    git("commit", "-q", "-am", "Carry 3.0.0");
    const text = `# Changelog\n\n${NEW}${OLD}`;
    expect(dashesIn("CHANGELOG.md", activeChangelog(text, ["2.1.0", "3.0.0"]))).toEqual([]);
    expect(check({ root, base: "main" }).found).toEqual(['CHANGELOG.md:5:7: U+2014 in "- new \u2014 with an em dash"']);
    // Once merged, the base branch carries 3.0.0, and its entry is what the archive shipped.
    expect(carriedOn("candidate", root)).toEqual(["2.1.0", "3.0.0"]);
    expect(check({ root, base: "candidate" }).found).toEqual([]);
    // A base that cannot be read is an error, not an empty list.
    expect(() => carriedOn("no-such-branch", root)).toThrow(/cannot read artifacts\/archives\.json on no-such-branch/u);
  });
});

