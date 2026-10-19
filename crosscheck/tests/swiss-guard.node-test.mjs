import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkSwissBoundary, inspectTrackedFile, trackedPaths } from '../lib/swiss-guard.mjs';

test('negative source fixtures reject literal Swiss imports and requires', () => {
  const fixtures = [
    ['src/example.ts', 'import swe from "swisseph";'],
    ['src/example.ts', 'import type { Position } from "pyswisseph";'],
    ['src/example.mts', 'import "swisseph";'],
    ['src/example.cts', 'import swe = require("swisseph");'],
    ['src/example.js', 'export { position } from "swisseph";'],
    ['src/example.mjs', 'const swe = await import( /* external */ "swisseph");'],
    ['src/example.cjs', 'const swe = module.require("pyswisseph");'],
    ['src/example.jsx', 'const location = require.resolve("swisseph");'],
    ['src/example.tsx', 'import {\n position\n} /* module */ from\n "swisseph/submodule";'],
    ['src/example.js', 'require(`swisseph`);'],
    ['src/example.js', 'const quote = /"/;\nimport swe from \'swisseph\';'],
    ['src/example.js', 'if (enabled) /"/.test(value);\nimport swe from \'swisseph\';'],
    ['src/example.js', 'const value = 1 + /"/.test(text);\nimport swe from \'swisseph\';'],
    ['src/example.js', 'if (enabled) {} /"/.test(value); import("swisseph");'],
    ['src/example.js', 'function example() {} /"/.test(value); require("swisseph");'],
    ['src/example.js', 'class Example {} /"/.test(value); import("swisseph");'],
    ['src/example.js', 'const value = { key: 1 } / 2; import("swisseph");'],
    ['src/example.js', 'const value = {} / "/"; import("swisseph");'],
    ['src/example.js', 'const value = function example() {} / 2; require("swisseph");'],
    ['src/example.js', 'const value = function example() {} / "/"; require("swisseph");'],
    ['src/example.js', 'const value = class Example {} / "/"; import("swisseph");'],
    ['src/example.js', 'const text = `value: ${require("swisseph")}`;'],
    ['src/example.js', 'const text = `value: ${`nested: ${require("swisseph")}`}`;'],
    ['src/example.js', 'require(("swisseph"));'],
    ['src/example.js', 'require?.("swisseph");'],
    ['src/example.js', String.raw`require("swiss\x65ph");`],
    ['src/example.js', String.raw`import "py\u0073wisseph";`],
    ['src/example.py', 'import swisseph as swe'],
    ['src/example.py', 'import os, swisseph as swe'],
    ['src/example.py', 'from swisseph import position'],
    ['src/example.py', 'from swisseph.coordinates import position'],
    ['src/example.py', 'from swisseph import (\n position,\n version\n)'],
    ['src/example.py', 'import os, \\\n swisseph as swe'],
    ['src/example.py', '__import__("swisseph")'],
    ['src/example.py', 'importlib.import_module("swisseph")'],
    ['src/example.py', 'importlib.import_module(name="swisseph")'],
    ['src/example.py', 'importlib.import_module(name=("swisseph"))'],
    ['src/example.py', '__import__(name="swisseph")'],
    ['src/example.py', '__import__("swiss" "eph")'],
    ['src/example.py', 'importlib.import_module("py" "swisseph")'],
    ['src/example.py', 'importlib.import_module(name=("py" # adjacent literal\n "swiss"\n "eph"))'],
    ['src/example.py', '__import__("swiss" \\\n "eph")'],
    ['src/example.py', '__import__(r"swisseph")'],
    ['src/example.py', '__import__(u"swisseph")'],
    ['src/example.py', String.raw`__import__("swiss\145ph")`],
    ['src/example.pyw', 'import swisseph as swe'],
    ['src/example.py', 'message = f"{__import__(\'swisseph\')}"'],
    ['src/example.py', 'message = rf"{importlib.import_module(\'swisseph\')}"'],
    ['src/example.py', 'message = Fr"{__import__(\'swisseph\')}"'],
    ['src/example.py', 'message = f"{f\'{__import__(\"swisseph\")}\'}"'],
    ['src/example.py', 'message = f"{value:{__import__(\'swisseph\')}}"'],
    ['src/example.py', 'message = f"{value:foo\'bar}"\nimport swisseph'],
    ['src/example.py', 'message = f"{value:\'{__import__(\'swisseph\')}\'}"'],
    ['src/example.py', 'message = f"{value:#{__import__(\'swisseph\')}}"'],
    ['src/example.py', 'message = f"{values[__import__(\'swisseph\'):]}"'],
    ['src/example.py', 'message = f"{(lambda: __import__(\'swisseph\'))()}"'],
    ['src/example.py', 'message = f"""line one\n{__import__(\'swisseph\')}\n"""'],
    ['src/example.py', String.raw`message = f"\{__import__('swisseph')}"`],
    ['tools/example', '#!/usr/bin/env python3\nimport swisseph as swe'],
    ['tools/example', '#!/usr/bin/env node\nrequire("swisseph")'],
    ['src/example.js', 'import swe from "@scope/swisseph";'],
    ['src/example.js', 'import swe from "./swisseph.js";']
  ];
  for (const [path, source] of fixtures) {
    const errors = inspectTrackedFile(path, source);
    assert(errors.some(error => error.rule === 'import'), `${path}: ${source}`);
    assert(errors.every(error => error.path === path && error.line > 0));
  }
});

test('source comments, docstrings, other imports and documentation are allowed', () => {
  const fixtures = [
    ['src/example.ts', '// import swe from "swisseph";\n/* require("swisseph") */\nimport { x } from "other";'],
    ['src/example.js', 'const example = \'import swe from "swisseph";\';'],
    ['src/example.js', 'const pattern = /import swe from "swisseph"/;'],
    ['src/example.js', 'if (enabled) {} /require("swisseph")/.test(value);'],
    ['src/example.js', 'function example() {} /import("swisseph")/.test(value);'],
    ['src/example.js', 'const text = `require("swisseph")`;'],
    ['src/example.py', '# import swisseph\n"""import swisseph as swe"""\nimport os as swisseph'],
    ['src/example.py', 'message = f"import swisseph; __import__(\'swisseph\')"'],
    ['src/example.py', 'message = f"{{__import__(\'swisseph\')}}"'],
    ['src/example.py', 'message = rf"{{importlib.import_module(\'swisseph\')}}"'],
    ['src/example.py', 'message = f"{\'__import__(\"swisseph\")\'}"'],
    ['src/example.py', 'message = f"{value:__import__(\'swisseph\')}"'],
    ['src/example.py', String.raw`__import__(r"swiss\x65ph")`],
    ['src/example.py', String.raw`__import__("swiss\eph")`],
    ['src/example.py', '__import__("swiss"); "eph"'],
    ['src/example.py', '__import__("swiss")\n"eph"'],
    ['src/example.py', 'importlib.import_module("other", "swisseph")'],
    ['src/example.py', 'message = "swiss" "eph"'],
    ['src/example.js', 'import example from "swissephology";'],
    ['docs/example.md', '```python\nimport swisseph\n```'],
    ['data/example.json', '{"instrument":"pyswisseph"}']
  ];
  for (const [path, source] of fixtures) assert.deepEqual(inspectTrackedFile(path, source), [], path);
});

test('Python eight-digit Unicode escapes decode in literal loader arguments only', () => {
  for (const source of [
    String.raw`__import__("\U00000073wisseph")`,
    String.raw`importlib.import_module(u"\U00000070yswisseph")`,
    String.raw`__import__("swiss" "\U00000065ph")`
  ]) {
    assert.deepEqual(inspectTrackedFile('src/example.py', source), [
      { path: 'src/example.py', rule: 'import', line: 1, reason: 'Swiss import forbidden' }
    ], source);
  }
  for (const [path, source] of [
    ['src/example.py', String.raw`__import__(r"\U00000073wisseph")`],
    ['src/example.py', String.raw`__import__("\U0001f31fwisseph")`],
    ['src/example.py', String.raw`message = "\U00000073wisseph"`],
    ['src/example.js', String.raw`require("\U00000073wisseph")`]
  ]) assert.deepEqual(inspectTrackedFile(path, source), [], source);
});

test('comment boundaries use the source language line terminators', () => {
  for (const terminator of ['\r', '\r\n', '\u2028', '\u2029']) {
    assert.deepEqual(inspectTrackedFile('src/example.js', `// comment${terminator}require("swisseph");`), [
      { path: 'src/example.js', rule: 'import', line: 2, reason: 'Swiss import forbidden' }
    ]);
  }
  for (const terminator of ['\r', '\r\n']) {
    assert.deepEqual(inspectTrackedFile('src/example.py', `# comment${terminator}import swisseph`), [
      { path: 'src/example.py', rule: 'import', line: 2, reason: 'Swiss import forbidden' }
    ]);
  }
  for (const separator of ['\u2028', '\u2029']) {
    assert.deepEqual(inspectTrackedFile('src/example.py', `# comment${separator}import swisseph`), []);
  }
});

test('tracked repository manifests reject Swiss dependencies and src imports stay absent', async () => {
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const errors = await checkSwissBoundary(repository);
  assert.deepEqual(errors.filter(error => error.rule !== 'import'), [], 'all tracked dependency files must pass');
  assert.deepEqual(errors.filter(error => error.rule === 'import' && error.path.startsWith('src/')), [],
    'tracked engine source must have no Swiss imports');
});

test('only exact crosscheck and sanctioned adapter paths exempt imports', () => {
  for (const path of ['crosscheck/lib/example.py', 'conformance/adapters/pyswisseph.py']) {
    assert.deepEqual(inspectTrackedFile(path, 'import swisseph as swe'), []);
  }
  for (const path of ['crosscheck-copy/example.py', 'src/crosscheck/example.py',
    'conformance/adapters/pyswisseph-copy.py', 'conformance/adapters/sub/pyswisseph.py']) {
    assert(inspectTrackedFile(path, 'import swisseph as swe').some(error => error.rule === 'import'), path);
  }
});

test('negative dependency fixtures apply everywhere including import exemptions', () => {
  const fixtures = [];
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'overrides', 'resolutions']) {
    fixtures.push(['nested/package.json', JSON.stringify({ [field]: { swisseph: '*' } })]);
  }
  fixtures.push(
    ['crosscheck/package.json', '{"dependencies":{"alias":"npm:pyswisseph@1"}}'],
    ['conformance/adapters/package.json', '{"bundledDependencies":["swisseph"]}'],
    ['nested/package-lock.json', '{"packages":{"node_modules/swisseph":{"version":"1"}}}'],
    ['nested/npm-shrinkwrap.json', '{"dependencies":{"alias":{"resolved":"https://example.invalid/pyswisseph.tar.gz"}}}'],
    ['nested/Pipfile.lock', '{"default":{"pyswisseph":{"version":"==1"}}}'],
    ['nested/pnpm-lock.yaml', 'packages:\n  swisseph@1: {}'],
    ['nested/shrinkwrap.yaml', 'dependencies:\n  swisseph: 1'],
    ['nested/yarn.lock', '"swisseph@*":\n  version "1"'],
    ['nested/uv.lock', '[[package]]\nname = "pyswisseph"'],
    ['nested/poetry.lock', 'name = "pyswisseph"'],
    ['nested/bun.lock', '{ "packages": { "swisseph": "1" } }'],
    ['nested/requirements.txt', 'pyswisseph[extra]==1; python_version >= "3"'],
    ['nested/requirements-dev.in', '-e git+https://example.invalid/project#egg=pyswisseph'],
    ['nested/requirements.txt', 'pyswiss\\\neph==1'],
    ['nested/requirements.txt', 'pyswiss\\\r\neph==1'],
    ['nested/requirements/base.in', 'pyswisseph'],
    ['nested/constraints.txt', 'pyswisseph==1'],
    ['nested/pyproject.toml', '[project.optional-dependencies]\ntest = ["pyswisseph"]'],
    ['nested/Pipfile', '[dev-packages]\npyswisseph = "*"'],
    ['nested/setup.py', 'setup(install_requires=["pyswisseph"])'],
    ['nested/setup.cfg', '[options]\ninstall_requires =\n  pyswisseph'],
    ['nested/Dockerfile', 'RUN pip install pyswisseph'],
    ['nested/Dockerfile.test', 'RUN npm install swisseph'],
    ['nested/Dockerfile', 'RUN pip install pyswiss\\\neph'],
    ['nested/test.Dockerfile', 'RUN pip install \\\n  pyswisseph']
  );
  for (const [path, source] of fixtures) {
    assert(inspectTrackedFile(path, source).some(error => error.rule === 'dependency'), path);
  }
  assert.deepEqual(inspectTrackedFile('package.json', '{"description":"external pyswisseph is optional","dependencies":{"other":"1"}}'), []);
  assert.deepEqual(inspectTrackedFile('requirements.txt', '# pyswisseph is external\nother==1'), []);
  assert.deepEqual(inspectTrackedFile('pyproject.toml', '# pyswisseph is external\n[project]\nname="other"'), []);
  assert.deepEqual(inspectTrackedFile('Dockerfile', '# pip install pyswisseph\nFROM scratch'), []);
  assert.equal(inspectTrackedFile('package.json', '{broken')[0].rule, 'manifest');
});

test('inventory uses tracked working files and refuses unsafe or missing inputs', async () => {
  const runtime = fileURLToPath(new URL('../runtime/', import.meta.url));
  await mkdir(runtime, { recursive: true });
  const root = await mkdtemp(join(runtime, 'swiss-guard-test-'));
  async function put(path, source) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), source);
  }
  try {
    await put('src/example.ts', 'export const value = 1;');
    await put('runtime/untracked.py', 'import swisseph');
    const paths = ['src/example.ts'];
    assert.deepEqual(await checkSwissBoundary(root, paths), []);
    await put('src/example.ts', 'import swe from "swisseph";');
    assert.deepEqual(await checkSwissBoundary(root, paths), [
      { path: 'src/example.ts', rule: 'import', line: 1, reason: 'Swiss import forbidden' }
    ]);
    for (const [path, source] of [
      ['tools/example.script', '#!/usr/bin/env python3\nimport swisseph'],
      ['tools/example.custom', '#!/usr/bin/env node\nrequire("swisseph")']
    ]) {
      await put(path, source);
      assert.deepEqual(await checkSwissBoundary(root, [path]), [
        { path, rule: 'import', line: 2, reason: 'Swiss import forbidden' }
      ]);
    }
    await assert.rejects(checkSwissBoundary(root, ['src/missing.py']), /ENOENT/);
    await assert.rejects(checkSwissBoundary(root, ['../outside.py']), /Invalid tracked path/);
    await symlink('example.ts', join(root, 'src/link.ts'));
    await assert.rejects(checkSwissBoundary(root, ['src/link.ts']), /Unsafe tracked file/);
    await symlink('src', join(root, 'link'));
    await assert.rejects(checkSwissBoundary(root, ['link/example.ts']), /Unsafe tracked directory/);
    const repository = fileURLToPath(new URL('../../', import.meta.url));
    const tracked = trackedPaths(repository);
    assert(tracked.includes('src/index.ts'));
    assert(tracked.includes('crosscheck/package.json'));
    assert(!tracked.some(path => path.startsWith('crosscheck/runtime/') || path.startsWith('crosscheck/node_modules/')));
  } finally { await rm(root, { recursive: true, force: true }); }
});
