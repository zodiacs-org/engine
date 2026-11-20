import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("the versioning policy lists every public package export exactly once", () => {
  const { exports } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const versioning = readFileSync(new URL("../docs/versioning.md", import.meta.url), "utf8");
  const list = versioning.match(/^- \*\*The entry points\.\*\* ([\s\S]*?)\.(?=\s|$)/m)?.[1] ?? "";
  const documented = [...list.matchAll(/`(\.\/[^`]+)`|\bthe root\b/g)].map(([, subpath]) => subpath ?? ".");
  const publicExports = Object.keys(exports).filter((subpath) => subpath !== "./internal" && subpath !== "./internal/math");

  expect(documented.sort()).toEqual(publicExports.sort());
});
