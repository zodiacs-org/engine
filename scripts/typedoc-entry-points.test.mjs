import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("TypeDoc lists every public package export", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const { entryPoints } = JSON.parse(readFileSync(new URL("../typedoc.json", import.meta.url), "utf8"));
  // These compatibility exports are private to Zodiacs.org, as described in the README.
  const privateExports = new Set(["./internal", "./internal/math"]);

  const missing = [];
  for (const [subpath, target] of Object.entries(packageJson.exports)) {
    if (privateExports.has(subpath)) continue;
    const source = target.types.replace(/^\.\/dist\/(.+)\.d\.ts$/, "src/$1.ts");
    if (!entryPoints.includes(source)) missing.push(`${subpath}: ${source}`);
  }
  expect(missing).toEqual([]);
});
