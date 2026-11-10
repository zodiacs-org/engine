import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const project = fileURLToPath(new URL("../", import.meta.url));
const fixture = JSON.parse(readFileSync(new URL("fixtures/profiles.json", import.meta.url), "utf8"));
const expected = fixture.profiles.find(({ id }) => id === "chaldean-shared-conventions");
const expectedComparison = fixture.comparisons.find(({ id }) => id === "equal-value-different-compound-and-debt");

function consumer(t) {
  const generated = join(project, ".generated");
  mkdirSync(generated, { recursive: true });
  const directory = mkdtempSync(join(generated, "consumer-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, "node_modules", "@zodiacs"), { recursive: true });
  symlinkSync(project, join(directory, "node_modules", "@zodiacs", "numerology"), "dir");
  writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
  return directory;
}

function invoke(args, cwd) {
  const child = spawnSync(process.execPath, args, {
    cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 30_000
  });
  assert.ifError(child.error);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stdout + child.stderr);
  assert.equal(child.stderr, "");
  return child.stdout;
}

function checkProfile(result) {
  assert.equal(result.receipt.suppliedName, expected.name);
  assert.equal(result.receipt.birthDate.iso, expected.date);
  assert.equal(result.receipt.conventions.system, expected.options.system);
  assert.equal(result.lifePath.value, expected.lifePath);
  assert.equal(result.birthday.value, expected.birthday);
  for (const calculation of ["expression", "soulUrge", "personality", "maturity"]) {
    const path = expected[`${calculation}Path`];
    assert.equal(result[calculation].receipt.sum.output, path[0]);
    assert.equal(result[calculation].value, path.at(-1));
  }
  assert.deepEqual(result.karmicLessons.values, expected.lessons);
  assert.deepEqual(result.hiddenPassion.values, expected.passions);
  assert.deepEqual(result.pinnacles.periods.map(({ value }) => value), expected.pinnacles);
  assert.deepEqual(result.challenges.periods.map(({ value }) => value), expected.challenges);
  assert.deepEqual(Object.values(result.cycles).map(({ value }) => value), expected.cycles);
}

test("local ESM consumer resolves the package export map without engine or registry dependencies", (t) => {
  const cwd = consumer(t);
  writeFileSync(join(cwd, "consumer.mjs"), `
import assert from "node:assert/strict";
import * as api from "@zodiacs/numerology";
assert(import.meta.resolve("@zodiacs/numerology").endsWith("/numerology/.build/index.js"));
assert.equal(api.destiny, api.expression);
assert.throws(() => api.expression("A", { system: "unsupported" }), RangeError);
const result = api.profile(${JSON.stringify(expected.date)}, ${JSON.stringify(expected.name)}, ${JSON.stringify(expected.options)});
assert(Object.isFrozen(result));
assert(Object.isFrozen(result.expression.receipt.normalization.receipt));
console.log(JSON.stringify(result));
`);
  checkProfile(JSON.parse(invoke(["consumer.mjs"], cwd)));
});

test("strict TypeScript consumer compiles public declarations, rejects invalid usage, and runs the example", (t) => {
  const cwd = consumer(t);
  copyFileSync(new URL("../examples/consumer.ts", import.meta.url), join(cwd, "consumer.ts"));
  const documentation = readFileSync(new URL("../docs/VALIDATION.md", import.meta.url), "utf8");
  const snippet = documentation.match(/```ts\n([\s\S]*?)```/u);
  assert(snippet);
  writeFileSync(join(cwd, "documentation.ts"), snippet[1]);
  writeFileSync(join(cwd, "controls.ts"), `
import { profile, birthday, personalYear, expression, normalizeName, reduceInteger } from "@zodiacs/numerology";
import type { ProfileOptions, CustomTransliteration, ReducedNumber } from "@zodiacs/numerology";
const valid: ProfileOptions = { system: "chaldean", masterNumbers: "preserve", method: "components", yAsVowel: "always" };
const result = profile("0001-01-01", "A", valid);
const value: ReducedNumber = result.expression.value;
const custom: CustomTransliteration = { id: "synthetic-consumer/1", mappings: { 岚: "LAN" } };
normalizeName("岚", { transliteration: custom });
reduceInteger(12345678901234567890n);
// @ts-expect-error Unsupported system must not widen to an arbitrary string.
expression("A", { system: "other" });
// @ts-expect-error Civil dates are strings, not Date objects.
profile(new Date(), "A");
// @ts-expect-error Results are readonly.
result.expression.value = value;
// @ts-expect-error Nested receipt arrays are readonly.
result.expression.receipt.contributions.push({});
// @ts-expect-error Profile cycles may be absent.
result.cycles.personalYear.value;
// @ts-expect-error Birthday does not accept the life-path method.
birthday("0001-01-01", { method: "whole-date" });
// @ts-expect-error Cycles do not accept a name system.
personalYear("0001-01-01", "2000-10-22", { system: "chaldean" });
// @ts-expect-error Only declared master policies are supported.
reduceInteger("11", { masterNumbers: "automatic" });
`);
  // Supply only console's used shape, with no ambient Node or engine types.
  writeFileSync(join(cwd, "console.d.ts"), "declare const console: { log(value: string): void };\n");
  writeFileSync(join(cwd, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", lib: ["ES2022"],
      types: [], strict: true, exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true,
      skipLibCheck: false, noEmitOnError: true, outDir: "output"
    },
    files: ["consumer.ts", "documentation.ts", "controls.ts", "console.d.ts"]
  }));
  invoke([join(project, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], cwd);
  checkProfile(JSON.parse(invoke(["output/documentation.js"], cwd)));
  // The intentionally invalid type controls are compiled but never executed.
  const result = JSON.parse(invoke(["output/consumer.js"], cwd));
  checkProfile(result.reading);
  assert.equal(result.alias, true);
  assert.deepEqual(result.named, result.reading.expression);
  assert.deepEqual(result.day, result.reading.cycles.personalDay);
  for (const [index, row] of result.comparison.numbers.entries()) {
    assert.deepEqual([row.compound.before, row.compound.after], expectedComparison.compounds[index]);
    assert.deepEqual([row.value.before, row.value.after], expectedComparison.values[index]);
  }
  assert.equal(result.comparison.numbers[0].compound.delta, -9);
  assert.equal(result.comparison.numbers[0].value.delta, 0);
  assert.equal(result.comparison.before.expression.karmicDebts[0].number, 13);
});
