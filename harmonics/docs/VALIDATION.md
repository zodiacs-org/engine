# Final prototype validation

The final source-checkout audit is [scripts/validate.mjs](../scripts/validate.mjs).
Run it from `harmonics/`, with Node 22 and npm on PATH:

```sh
npm ci --cache .cache/npm --no-audit --no-fund
mkdir -p .cache
node scripts/validate.mjs > .cache/final-validation.json
```

The audit runs the project's typecheck and complete Vitest suite, then checks
the executable with network transports blocked. It compares repeated file
execution and stdin execution byte for byte for chart and spectrum commands
on the synthetic point and birth fixtures, and dial commands on every
supported circle with synthetic point and birth fixtures. It also compares
the original natal envelope across birth commands. Each case records its
fixture, options and stdout digest. These comparisons establish reproducibility
over those inputs on the recorded runtime; they are not accuracy references
or a promise of identical output on other runtimes.

The checked-in [evidence](evidence/m12-validation.json) records the final run
on Node 22.22.2. The report names the test files and their successful test
count. Hand-derived integer and binary-fraction expectations remain in those
tests; their derivations and precise synthetic inputs are linked from the
[arithmetic guide](../README.md#arithmetic-evidence). Engine comparisons check
delegation and receipt preservation. None of these checks establish independent
ephemeris accuracy or predictive validity.

Source identity digests cover sorted paths and file digests for the tracked
engine files outside this project, and for this project's sources, tests,
tooling, manifests and fixtures. Documentation and evidence are excluded from
the project source digest so the report can be retained without changing that
identity. Digests identify local bytes, not authenticated release artifacts.
To reproduce the stored report, use its recorded runtime, these source bytes
and the locked project dependencies. Keep fresh output under `.cache/` for
comparison; replace committed evidence only for a deliberate new audit.

## Isolation and packaging

The audit uses read-only git commands to identify the parent of the commit
that introduced `PLAN.md`. Net committed changes since that base, current
tracked changes and nonignored untracked files must stay under `harmonics/`.
The report records the base. This is a checkout isolation check, not a review
of every intermediate historical edit or ignored file elsewhere in the checkout.
Tracked engine files outside the project and any existing `dist/` files are
hashed before and after validation to detect mutations by the checks. The
current audit starts and ends without `dist/`.

Retained project files must be regular files below the user's requested size
limit, documentation must contain no em dash, and dependency, cache, coverage
and bulk generated folders must remain ignored. The script enforces those
conditions over tracked and nonignored untracked project files. Dependencies
and generated caches are outside that retained-file scan.

The root `npm pack --dry-run --json --ignore-scripts` manifest excludes
`harmonics/`. This command lists files without creating an archive. The audit
also runs the root `npm run package:contents` gate. In this source-only checkout
it fails because `dist/calc.d.ts` is absent. The report records it as
`unavailable`, and accepts only that specific missing-build failure. Package
exclusion passed; full engine package contents and import-size budgets remain
unverified here. No engine build was run because the task prohibits writing
engine build output. The repository's CI remains authoritative for release
gates, archive binding, packed consumers, conformance and atlas checks.

## Remaining limitations

- This private prototype depends on relative engine source imports and local
  development dependencies. It has no published package or standalone emitted
  JavaScript build. The optional patterns entry inherits the engine detector's
  chart and ephemeris imports; the default pure entry remains separate.
- Harmonic results transform longitude and known speed; houses, latitude and
  declination are not recast. Higher harmonics amplify source rounding, and
  transform arithmetic and dial boundary decisions retain binary64 limits.
- Spectrum scoring is a documented analysis convention without empirical
  calibration. Unknown speeds need explicit source filtering. Configured
  aspect matching and historical pattern matching have separate policy and
  arithmetic contracts.
- Dial enumeration can require substantial time and memory. Input document
  bounds do not impose execution budgets, pagination or result-size caps.
- Natal envelopes describe the original chart only. They do not attest derived
  harmonics, spectra, patterns, pictures or trees. There is no analysis replay
  codec or authenticated provenance for these outputs.

The [contract reference](CONTRACTS.md) and [guide](../README.md) give the full
selection, units, midpoint and receipt contracts. These limitations remain
part of the completed prototype rather than claims resolved by this audit.
