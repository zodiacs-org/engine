# Electional search workbench

A private TypeScript project for composing and ranking time windows over the
existing astrology engine. Progress is tracked in [PLAN.md](PLAN.md). The
interval foundation, strict JSON/YAML rule loading, read-only engine and
events adapters, and Moon sign, phase, direct-motion, Moon-not-void and
planetary-hour, benefic house/angular, applying-aspect and eclipse/station
avoidance and synthetic natal synastry rule windows are
implemented so far, with hard-rule composition, weighted scoring and
deterministic ranking described in [SCORING.md](SCORING.md). The bounded async
stream described in [STREAMING.md](STREAMING.md) emits facts by default, with
shared budgets, cancellation and seam continuation. The facts-only CLI and
editable traditional preset packs are described in [CLI.md](CLI.md) and
[PRESETS.md](PRESETS.md). The HTTP endpoint is a planned milestone.
[EVALUATION.md](EVALUATION.md)
describes the basic evaluator and
its uncertainty handling. [VOID.md](VOID.md) describes Moon-not-void lookahead,
body conventions, interval ownership and unknown tails. Planetary-hour date
ownership, missing solar events and receipt scope are in [HOURS.md](HOURS.md).
House fallbacks, angular and applying conventions, numerical boundary uncertainty
and request accounting are in [CHARTS.md](CHARTS.md).
Elapsed day margins, eclipse models, padded coverage and uncertain exclusion
edges are in [AVOIDANCE.md](AVOIDANCE.md).
Fixed natal longitudes, native orb caps, pair matching and receipt provenance
are in [SYNASTRY.md](SYNASTRY.md).
The adapter contract and optional events integration are described in
[ADAPTERS.md](ADAPTERS.md). The
configuration vocabulary is described in [RULES.md](RULES.md).

Electional rule packs describe authored traditional conventions, not predictions.
Tests and examples use synthetic data. Code and documentation here use the
repository's [MIT license](../LICENSE); engine data keeps the attribution and
terms recorded in [LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE).

## Development

Run these commands from this directory using Node matching `package.json`:

```sh
npm ci --cache .cache --ignore-scripts
npm run typecheck
npm test
npm run build
npm run check:isolation
```

Dependencies are locked locally; these commands do not install or build the
parent package. The engine bridge reads parent source and bundles it with the
locally pinned ephemeris into gitignored `generated/`. Compiled library files
go to the gitignored `build/` directory.
Tests use `*.electional-check.ts` and the explicit include in
[vitest.config.ts](vitest.config.ts), outside the parent Vitest default discovery
pattern. Generated data, caches and coverage stay in gitignored directories.
The parent npm package's file list excludes this workbench.
`check:isolation` verifies that exclusion using npm's actual dry-run selection
and verifies parent Vitest discovery without collecting or executing its tests.
It skips the parent build hook and creates no archive. It does not replace the
engine's package-content budgets or archive-binding gates, which require the
parent build and release history.

## Interval API

Import the library from `src/index.ts` during TypeScript development, or from
`build/index.js` after the local build. An `Interval` is `{ startMs, endMs }`;
the start belongs to the window and the end does not. Endpoints are integer
epoch-millisecond labels representable by JavaScript `Date`. Reversed spans
are invalid; an equal start and end is valid and represents an empty set.

| Function | Behavior |
| --- | --- |
| `normalizeIntervals(values)` | Copy, sort and merge overlapping or adjacent spans; omit empty spans. |
| `unionIntervals(left, right)` | All members of either set. |
| `intersectIntervals(left, right)` | Only members of both sets. |
| `subtractIntervals(allowed, excluded)` | Members of allowed outside excluded. |
| `clipIntervals(values, domain)` | Intersection with a declared domain. |
| `complementIntervals(domain, values)` | Gaps inside the domain, including when values extend outside it. |
| `containsInstant(values, atMs)` | Membership under the same endpoint ownership. |

All operations validate their full input, including spans that would otherwise
be discarded. Invalid endpoints, malformed arrays, sparse arrays and reversed
spans throw `RangeError`. Window results have frozen arrays and frozen interval
objects, and never sort, freeze or change caller-owned data. Membership also
accepts unnormalized input and normalizes it before searching.

These helpers do not resolve local dates or convert time scales. Callers must
put every operand on the same resolved clock first. An empty interval set is
only an arithmetic value; later search adapters must distinguish a completed
empty result from unknown or refused coverage.

The executable example below uses arbitrary millisecond labels, with its
expected result enforced by `test/intervals.electional-check.ts` and the
`partial-overlap` golden case:

```js
import { intersectIntervals, subtractIntervals } from './build/index.js';

const allowed = [{ startMs: 0, endMs: 10 }];
const other = [{ startMs: 5, endMs: 15 }];
console.log(intersectIntervals(allowed, other)); // [{ startMs: 5, endMs: 10 }]
console.log(subtractIntervals(allowed, other));  // [{ startMs: 0, endMs: 5 }]
```

## Evidence and limits

[test/fixtures/intervals.json](test/fixtures/intervals.json) records manually
derived golden sets and the derivation for each case. Its reference is the
definition of membership in a half-open interval on synthetic integer labels.
[test/set-membership.electional-check.ts](test/set-membership.electional-check.ts)
independently checks finite-set Boolean operations using bit masks, including
all subsets and ordered pairs on its declared domain, and every subdomain for
clipping and complement. The golden test also checks Date limits, endpoint
ownership, malformed input and immutable copies.

This interval evidence establishes the checked set behavior and contains no
astronomical reference instants. Independent JPL Horizons references for the
implemented astronomical rules are described in
[references/README.md](references/README.md). They check the declared cases
only, with no claim about exhaustive event completeness, search performance
or predictive validity. The engine
and events adapters delegate calculations and searches to existing APIs and
carry their clocks, receipts and refusals. Their contract tests establish
control flow and set ownership, not astronomical accuracy.
