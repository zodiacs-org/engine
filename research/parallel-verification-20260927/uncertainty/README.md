# Birth-window uncertainty: isolated research handoff

This folder specifies and prototypes an **experimental companion tool**, not a new export of `@zodiacs/engine`. No engine, site, app, release or package API is changed.

The goal is to answer: **Which chart features change when the supplied birth time, place or calculation convention changes?** It does not rectify birth times or establish that an interpretation predicts an outcome.

Contents:

- [`SPECIFICATION.md`](SPECIFICATION.md): implementation contract, mathematical semantics, integration stages, and release gates.
- [`schemas/request.schema.json`](schemas/request.schema.json) and [`schemas/result.schema.json`](schemas/result.schema.json): draft 2020-12 JSON Schemas for the experimental wire format.
- [`fixtures/acceptance.json`](fixtures/acceptance.json): independently specified analytic and structural cases. No invented astronomical placements.
- [`examples/`](examples/): resolved UTC and unresolved local-wall request examples.
- [`src/preview.mjs`](src/preview.mjs): a bounded finite evaluator using only the engine's public `natalChart`, `houseOf`, `signForLongitude` and `separation` functions.
- [`tests/verify.mjs`](tests/verify.mjs): dependency-free acceptance checks with a synthetic analytic adapter; these verify this tool's contract, not the real sky.
- [`SOURCES.md`](SOURCES.md): pinned source inventory and exact implementation constraints.

Run contract checks:

```sh
node uncertainty/tests/verify.mjs
```

Run the finite evaluator against a separately built, frozen engine:

```sh
node uncertainty/src/preview.mjs \
  --engine /absolute/path/to/frozen-engine/dist/index.js \
  --request uncertainty/examples/utc-window.json \
  --output /absolute/path/to/preview-result.json
```

The CLI records the loaded module SHA-256 and exported version; the request's commit is an asserted target, not proof of the module's source ancestry. Set `model.engineCommit` to `null` for an unknown candidate; never copy the baseline example's commit onto another build. The enclosing toolkit's source snapshot manifest supplies baseline ancestry. This preview never calls an external service. It does not certify continuum coverage, turn sample counts into probabilities, resolve wall times, infer missing birth data, or silently switch house systems.

The exact preview sub-profile is: resolved UTC intervals at integer millisecond endpoints, a point location or no location, engine-model or pinned ΔT, explicitly chosen house systems, and body-sign/angle-sign/body-house/aspect-present features. A union is sampled as a union, with overlapping UTC instants deduplicated. Unsupported requests fail clearly. Broader schema fields are implementation targets documented in the specification, not silently accepted features.
