// Copies src/esm-only.cjs to dist/esm-only.cjs, after tsup has emptied dist/.
// Every entry point in package.json "exports" names that file under the
// "require" condition, so require("@zodiacs/engine") (or of any subpath)
// throws one documented error, code ERR_ZODIACS_ESM_ONLY, that says to use
// import, rather than Node's ERR_PACKAGE_PATH_NOT_EXPORTED. The package
// ships no CommonJS build: import() and import statements resolve the
// "import" condition as before. scripts/esm-only.test.mjs holds the file and
// the exports map to this, and npm run exports:smoke and the packed-consumer
// check hold the built and the packed package to it.
import { copyFileSync } from "node:fs";

copyFileSync(new URL("../src/esm-only.cjs", import.meta.url), new URL("../dist/esm-only.cjs", import.meta.url));
console.log("esm-only: dist/esm-only.cjs");
