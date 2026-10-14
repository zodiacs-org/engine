# Foundation validation

Checked on Node v22.22.2 with the local dependency lock. The runtime was
installed into the ignored project cache because the shell initially provided
Node v20.19.2. The setup command was:

```sh
npm install --prefix directions/.cache/node22 --cache directions/.cache/npm --no-audit --no-fund --no-package-lock node@22.22.2
```

With `directions/.cache/node22/node_modules/.bin` prepended to `PATH`, these
commands passed:

```sh
npm --prefix directions run typecheck
npm --prefix directions test
npm --prefix directions run check:isolation
```

Vitest reported all checks passing in `checks/conventions.check.ts`.
The cases exercise every admitted convention combination, required fields,
converse construction, unsupported combinations, malformed data objects and
snapshot ownership. `checks/conventions.types.ts` checks invalid combinations
at compile time. These are contract tests, not numerical arc evidence.

The isolation script's npm dry run reported that `directions/` is excluded
from the engine package. It also passed the project file-size, test-discovery
and documentation punctuation checks. An independent review found no blocking
issue in the foundation.

The required root command `npm run package:contents` was attempted with the
same runtime and a cache under `directions/`. It failed at its first missing
build prerequisite:

```text
AssertionError [ERR_ASSERTION]: packed package is missing dist/calc.d.ts
```

The checkout has no engine build or root dependencies. The user's scope
forbids writing root `dist/` or installing outside `directions/`, so the full
engine build, package budgets and engine CI suite were not run. The local
isolation check establishes package exclusion only; it is not a substitute
for those gates. No archive was packed and no git metadata was changed.
