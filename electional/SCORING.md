# Optional internal/pro numeric annotation

Default composition, search, streaming, CLI and HTTP output contains no scores
or ranking. [CONDITIONS.md](CONDITIONS.md) describes that factual contract.

The separate `internal-scoring` module is internal/pro-only and off by default.
It must never be enabled on consumer surfaces, including the ChatGPT app and
zodiacs.org. It is excluded from library barrel exports and is never called
by a search or transport. CLI and HTTP reject scoring controls. To annotate a
factual library result explicitly:

```js
import { scoreConditions } from './build/internal-scoring.js';

const annotated = scoreConditions(facts, { enabled: true });
```

`enabled: true` is mandatory. Optional `weights` overrides identify declared
preferred-rule ids and contain finite nonnegative numbers. Other ids,
required-rule overrides, executable weight accessors, invalid values or a
nonfinite total reject. Omitting overrides uses declared preference weights.
The module creates immutable annotations without changing facts or policy.

For each window, `score.lower` sums weights of satisfied preferred checks;
`score.upper` also includes unresolved preferred checks. `score.maximum` is the
sum of effective preference weights. Every explanation retains its neutral
text, rule state and receipts and adds effective `weight` and a lower/upper
`contribution`. Required checks contribute zero even when they fail. Thus a
numeric total does not imply required-check success. `score.status` stays
`bounded` when a preference is unknown, even with zero weight.

Sums use JavaScript numbers in rule declaration order without decimal
rounding or normalization. They are internal arithmetic labels, not
probabilities, predictions or date recommendations. Output always keeps the
original chronology. There are no ranks or activity-quality labels.

[test/internal-scoring.electional-check.ts](test/internal-scoring.electional-check.ts)
enforces explicit opt-in, overrides, bounded unknowns, finite arithmetic,
immutable annotations and unchanged facts and chronology. Numeric references
come from the hand-derived sets and sums in
[test/fixtures/composition-windows.json](test/fixtures/composition-windows.json)
over its declared synthetic integer domain. They are arithmetic evidence only.
Historical M10/M11 evidence records describe earlier contracts; the M13
record in [docs/evidence/m13-tests.json](docs/evidence/m13-tests.json) covers
current facts-only defaults and the separate opt-in module.
