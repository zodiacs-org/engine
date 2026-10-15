# Local validation and consumers

Run commands from `numerology/` with the Node version admitted by its local
package manifest. Use the pinned compiler in the local lockfile:

```sh
npm ci --ignore-scripts
npm run verify
npm run consumer:smoke
```

`verify` type checks, builds only this project, and runs the complete Node
test suite. `consumer:smoke` builds and runs just the consumer and documentation
checks; these are also included in the complete suite. Neither command
builds root `dist/`, changes root dependencies, packs an archive, or publishes.
Generated JavaScript and declarations stay in `.build/`; temporary consumers
stay in `.generated/` and are removed after checking. npm caches stay in
`.cache/`. The project ignore file excludes those directories.

## Source-checkout use

A script in this directory can import `./.build/index.js` after building,
as the README examples do. An ESM consumer in another local directory can
link the project using its own package manager with a local file dependency
pointing to `numerology/`. Build the source project before importing it.
No registry fetch or published numerology package is needed at runtime.
The consumer resolves the `import` and `types` conditions of the project's
export map to JavaScript and declarations respectively.

For example, the [typed consumer](../examples/consumer.ts) uses the local
package name and supplies synthetic inputs with explicit configuration:

```ts
import { profile } from "@zodiacs/numerology";
import type { ProfileOptions } from "@zodiacs/numerology";

const options = {
  system: "chaldean",
  targetDate: "2000-10-22"
} satisfies ProfileOptions;
const result = profile("0001-01-01", "Ael Vorn", options);
console.log(JSON.stringify(result));
```

The `chaldean-shared-conventions` fixture in
[profiles.json](../test/fixtures/profiles.json) anchors that example's
arithmetic. `test/consumer.test.mjs` checks this documentation snippet and
the full consumer against that handwritten control.

The smoke test creates an ignored local consumer and a package symlink;
it never runs an install lifecycle or writes another repository. It runs
plain ESM package imports, compiles the committed typed example with strict
NodeNext settings and without ambient Node or engine types, then runs the
compiled consumer. Additional compiler controls ensure invalid systems,
options, dates as objects, and mutation of readonly results fail typing.
Runtime validation of date and name content still comes from the library.

## Evidence and limits

The [evidence map](evidence/README.md) names tests and fixture files for each
calculation. The fixtures are handwritten convention controls. Separate
bigint arithmetic, conservation properties, calendar checks, replay corruption
controls, and CLI subprocess comparisons complement them. Finite tests
establish arithmetic and declared behavior over their covered inputs; they
do not establish linguistic completeness or predictive accuracy.

`test/documentation.test.mjs` checks the public export inventory, local
documentation links, receipt schema inventory, JavaScript README examples,
and typed documentation example. The documentation's numeric formulas and
limits refer to the tests named alongside them. No throughput, agreement,
or broad accuracy figure is claimed here. Raw validation output can be
redirected to `.cache/` and is not committed as a generated dataset.

`test/isolation.test.mjs` checks authored file sizes and documentation
punctuation, generated-directory ignore rules, runtime-dependency absence,
and the library's local import graph. Its script-free npm dry run checks
that no `numerology/` path enters the engine's proposed package. A dry run
does not create an archive or establish engine build completeness or size.

After adding project files, also run the existing root gate, with npm's
cache directed inside the ignored project cache:

```sh
# From the repository root, when its existing dist/ build is available.
npm_config_cache="$PWD/numerology/.cache/npm" npm run package:contents
```

If the existing build is absent, record the gate's missing-build error and
retain the separate exclusion verdict. Do not generate root `dist/` to
satisfy this isolated project's checks. Archive-binding, engine build,
conformance, atlas, and release checks remain repository gates; a passing
local numerology suite is not a claim that those gates ran.
