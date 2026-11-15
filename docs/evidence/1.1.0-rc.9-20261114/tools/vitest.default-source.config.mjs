// The suite without src/test-setup.ts, so that every test file that does not
// set a default itself runs on the package's own default, the shipped DE440
// pack. Run from the repository root:
//   npx vitest run --root . --config docs/evidence/1.1.0-rc.9-20261114/tools/vitest.default-source.config.mjs
// Failures are expected: see ../README.md.
export default { test: { setupFiles: [] } };
