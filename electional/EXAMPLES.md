# Executable synthetic condition examples

Run from `electional/` using its declared Node runtime after `npm run build`.
The library example reads fixed local documents and awaits each output write
before pulling another chunk. It emits the original newline-delimited frames,
including source audits, receipts, failed checks and unknown coverage.

```sh
node examples/library.mjs hours
node examples/library.mjs conditions
node examples/library.mjs long-range
node examples/http.mjs
```

All activities, coordinates and natal inputs here are invented. The condition
choices illustrate configuration and traditional conventions. They do not
predict an outcome or assign an activity assessment to a date. All outputs
remain chronological. Declared preference weights are configuration facts and
have no effect on these examples. The optional internal/pro module is absent
from their import graphs.

| Example document | Checks illustrated | Capability requirements |
| --- | --- | --- |
| [synthetic-hours.yaml](examples/synthetic-hours.yaml) | Required coverage by any classical hour ruler and an optional Venus-hour check. | Existing engine sky API. |
| [synthetic-conditions.json](examples/synthetic-conditions.json) | Moon void state, direct Mercury/Venus motion, Moon sign/phase, hours, benefic houses/angles, applying aspects, eclipse/station margins and a synthetic natal aspect check. | Existing engine and optional events APIs. Unavailable optional checks remain unresolved. |
| [synthetic-long-range.yaml](examples/synthetic-long-range.yaml) | The same hour checks across the declared monthly range with daily chunks. | Existing engine sky API, without events. |

The full condition example requires only the all-ruler hour condition; every
other condition is optional so that an absent events build can be inspected
alongside the available facts. This is an example policy, not a claim that all
conditions were calculated. Inspect each explanation's state and the source
refusals. To require a condition, edit its mode and remove its weight, then
validate the resulting document.

The eclipse radii in [conditions-controls.json](examples/conditions-controls.json)
are the kilometre values divided by the astronomical unit from the existing
[reference declaration](references/avoidance-cases.json). Their sources and
spherical-model limits are in [AVOIDANCE.md](AVOIDANCE.md). The example test
enforces that derivation; it does not establish eclipse completeness. The
natal chart is explicitly labelled synthetic, with a resolved UTC instant
and an invented equatorial location. No real person's birth data is used.

The equivalent CLI calls are:

```sh
node bin/electional.mjs search --rules examples/synthetic-hours.yaml --controls examples/controls.json
node bin/electional.mjs search --rules examples/synthetic-conditions.json --controls examples/conditions-controls.json
node bin/electional.mjs search --rules examples/synthetic-long-range.yaml --controls examples/controls.json
```

Complete, unresolved and refused searches retain the library status and the
[CLI exit convention](CLI.md). An unresolved example intentionally exits
with its unresolved status. A smaller work or output allowance may refuse a
range; increasing a limit does not prove event discovery complete. With shell
redirection, save any raw output under gitignored `generated/`.

[examples/http.mjs](examples/http.mjs) starts the existing server on an
OS-assigned loopback port, submits the short hour example, writes its original
response frames, then closes the server. It checks the terminal frame before
treating the transport as finished. The request is bounded by the committed
operator policy. This is an executable local endpoint example, without a
persistent service, chart API, calendar exporter or webhook.

[scripts/check-examples-esm.mjs](scripts/check-examples-esm.mjs) executes these
library and CLI paths plus the loopback example. It checks complete range
ownership, chronology, factual wording, required all-ruler coverage, per-rule
states, source receipts, cumulative work and terminal statuses. Each emitted
chunk is checked and discarded; the script records summaries rather than raw
sky results. All-ruler coverage is a set identity on resolved source hours,
not an independent astronomical accuracy check.

The execution record is [m14-examples.json](docs/evidence/m14-examples.json).
[VERIFICATION.md](VERIFICATION.md) separates that evidence from independent
ephemeris comparisons and lists the remaining limitations.
