import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const generated = fileURLToPath(new URL("../.generated/", import.meta.url));
const script = new URL("../scripts/audit.mjs", import.meta.url).href;
const temporary: string[] = [];

function fixture(files: Record<string, string | Uint8Array>): string {
  mkdirSync(generated, { recursive: true });
  const directory = mkdtempSync(resolve(generated, "audit-test-"));
  temporary.push(directory);
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(resolve(directory, path, ".."), { recursive: true });
    writeFileSync(resolve(directory, path), bytes);
  }
  return directory;
}

function audit(root: string, files: string[], limit = 2_000_000): { files: number; links: number; errors: string[] } {
  return JSON.parse(execFileSync(process.execPath, [
    "--input-type=module", "-e",
    "const { auditFiles } = await import(process.argv[1]); "
      + "console.log(JSON.stringify(auditFiles(process.argv[2], JSON.parse(process.argv[3]), Number(process.argv[4]))));",
    script, root, JSON.stringify(files), String(limit),
  ], { encoding: "utf8", timeout: 10_000 }));
}

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("project constraint audit", () => {
  it("checks ordinary local links and heading fragments without fetching external URLs", () => {
    const root = fixture({
      "LICENSE": "Synthetic fixture licence text\n",
      "batch/README.md": "# Synthetic guide\n\n[Licence](../LICENSE) [Guide](docs/guide.md#repeat-1) "
        + "[Self](#synthetic-guide) [External](https://example.invalid/unavailable)\n"
        + "```md\n[Example syntax](missing-file.md)\n```\n",
      "batch/docs/guide.md": "# `Repeat`\n\n## Repeat\n",
    });
    expect(audit(root, ["batch/README.md", "batch/docs/guide.md"]))
      .toEqual({ files: 2, links: 3, errors: [] });
  });

  it("reports missing evidence, invalid fragments, escaping paths and em dashes", () => {
    const root = fixture({
      "batch/README.md": "# Synthetic\n[Missing](no.json) [Heading](#absent) "
        + "[Escaped](../../outside.md) [Malformed](%XX)\n" + String.fromCharCode(0x2014),
    });
    const report = audit(root, ["batch/README.md", "src/untouched.ts", "batch/../escape.ts"]);
    expect(report.errors).toEqual(expect.arrayContaining([
      "Documentation contains an em dash: batch/README.md",
      "Missing or external local link in batch/README.md: no.json",
      "Missing heading in batch/README.md: #absent",
      "Missing or external local link in batch/README.md: ../../outside.md",
      "Invalid link in batch/README.md: %XX",
      "File is outside batch/: src/untouched.ts",
      "File is outside batch/: batch/../escape.ts",
    ]));
  });

  it("refuses tracked runtime data, symlinks and files at the size limit", () => {
    const root = fixture({
      "batch/source.ts": "export {};\n",
      "batch/.runtime/results.ndjson": "{}\n",
      // Exercise the exact boundary with a smaller limit, keeping scratch files
      // themselves below the repository's file budget.
      "batch/at-limit.json": new Uint8Array(100),
      "batch/below-limit.json": new Uint8Array(99),
    });
    symlinkSync("source.ts", resolve(root, "batch/link.ts"));
    symlinkSync("missing.ts", resolve(root, "batch/dangling.ts"));
    const report = audit(root, [
      "batch/.runtime/results.ndjson", "batch/at-limit.json", "batch/below-limit.json", "batch/link.ts", "batch/dangling.ts",
    ], 100);
    expect(report.errors).toEqual([
      "Generated data must remain ignored: batch/.runtime/results.ndjson",
      "File reaches the size limit: batch/at-limit.json",
      "Source must be a regular file: batch/link.ts",
      "Source must be a regular file: batch/dangling.ts",
    ]);
  });
});
