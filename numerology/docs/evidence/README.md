# Numerology arithmetic evidence map

This is an authored map to committed tests and handwritten controls, not a
generated benchmark report. Follow [validation](../VALIDATION.md) to run them.
The tests define their exhaustive domains, seeded generators, boundary cases,
and independent reference arithmetic. All birth details are synthetic.

| Contract | Enforcing test | Handwritten controls |
| --- | --- | --- |
| Exact reduction, master stops, visited debt stages, allocation bound | [reduction.test.mjs](../../test/reduction.test.mjs) | [reductions.json](../../test/fixtures/reductions.json) |
| Gregorian validation, life-path formulas, birthdays | [dates.test.mjs](../../test/dates.test.mjs) | [dates.json](../../test/fixtures/dates.json) |
| Latin expansions, separators, marks, Y classification | [names.test.mjs](../../test/names.test.mjs) | [names.json](../../test/fixtures/names.json) |
| Greek/Cyrillic tables, canonical context, exact caller mappings | [transliteration.test.mjs](../../test/transliteration.test.mjs) | [transliteration.json](../../test/fixtures/transliteration.json) |
| Letter assignments, selections, sums, source locators | [name-numbers.test.mjs](../../test/name-numbers.test.mjs) | [name-numbers.json](../../test/fixtures/name-numbers.json) |
| Maturity, table-relative missing values, frequency ties | [derived.test.mjs](../../test/derived.test.mjs) | [derived.json](../../test/fixtures/derived.json) |
| Explicit-target calendar cycles and nested stages | [cycles.test.mjs](../../test/cycles.test.mjs) | [cycles.json](../../test/fixtures/cycles.json) |
| Pinnacle sums, challenge differences, attained-age timing | [periods.test.mjs](../../test/periods.test.mjs) | [periods.json](../../test/fixtures/periods.json) |
| Profile assembly, signed comparison deltas, captured settings | [profiles.test.mjs](../../test/profiles.test.mjs) | [profiles.json](../../test/fixtures/profiles.json) |
| Cross-system/script/calendar properties, replay corruption, library/CLI parity | [cross-layer.test.mjs](../../test/cross-layer.test.mjs) | [cross-layer.json](../../test/fixtures/cross-layer.json) |
| JSON flags/stdin, encoding and allocation bounds, fixed errors and statuses | [cli.test.mjs](../../test/cli.test.mjs) | Existing arithmetic fixtures plus explicit transport requests. |
| Package export resolution, strict declarations, executable typed example | [consumer.test.mjs](../../test/consumer.test.mjs) | Profile fixture used by the local consumer. |
| API/type inventory, local links, executable documentation, schema inventory | [documentation.test.mjs](../../test/documentation.test.mjs) | README examples and the typed consumer control. |
| Engine package exclusion, local imports, ignored outputs, file bounds | [isolation.test.mjs](../../test/isolation.test.mjs) | Script-free npm dry-run listing and authored file traversal. |

Pinned fixture values are regression and declared-convention controls.
Independent test arithmetic helps detect implementation mistakes; it does
not turn symbolic interpretations into externally established facts. No
result is compared with Swiss Ephemeris or taken from its output.
