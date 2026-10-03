# Focused public-API reproductions

This directory investigates two concerns without changing the engine: a natal
clock override passed into Saturn-return calculations, and the interpretation
of Moon illumination. Five small controls check relevant existing input and
clock boundaries. This is a finite acceptance aid, not numerical certification
or a replacement for the engine's existing release gates.

## Run

Use an installed/extracted engine package whose `astronomy-engine` dependency
is available to Node. The runner itself uses only Node built-ins. It performs
no fetches, installs, or production writes.

```sh
node run-reproductions.mjs \
  --engine /absolute/path/to/package/dist/index.js \
  --tarball /absolute/path/to/zodiacs-engine-0.1.1-rc.10.tgz \
  --source-ref f5f33892a95cd0d6cd4a11a80e66f802b11bccfa \
  --output /absolute/path/to/reproductions/results.json
```

Only `--engine` is mandatory. The tarball digest establishes which package
bytes were inspected. The source ref is caller-supplied provenance and is
explicitly not treated as attestation. The result also records the distribution
file digests, dependency identity, Node runtime and clock used by the reference
calculation.

The runner exits nonzero for blocked reference access or a failed documented
control. A reproduced design concern is recorded as an observation and does not
silently introduce a new release gate. `results.schema.json` defines the result
envelope. `FINDINGS.md` records the measured run when available.

## Interpreting the two concerns

**Saturn-return clock consistency.** `natalChart` explicitly supports a `deltaT`
override. `saturnReturn` accepts the same birth object or an engine-created
chart, but its exact promise for that override needs clarification. The runner
compares its returned natal Saturn target with the target in the pinned chart,
then checks whether all return results remain identical to the unpinned run.
It includes a one-second override and a synthetic one-hour override. The latter
is a diagnostic valid input, not an assertion of plausible modern time error.
If the discrepancy reproduces, the handoff is to honor the natal target or
explicitly reject/document unsupported overrides. It does not prescribe using
one constant natal ΔT for all future event times.

**Moon illumination.** A longitude-elongation phase angle is a legitimate
astrological convention. The illumination formula currently attached to it can
still be an approximation to physical illuminated fraction. The runner compares
33 daily instants with Astronomy Engine's `Illumination` geometry, after
explicitly installing the Zodiacs clock in that module. This shares the same
ephemeris dependency; it is not an independent JPL/Swiss truth comparison.
Measured differences establish the approximation's effect in that finite
sample, not an all-time maximum or a defect by themselves.

## Ownership

This work belongs outside the production package and runtime, in an isolated
research subtree with no edits to existing files. No engine source,
dependencies, lockfiles, receipts, vendored artifact, sealed holdout,
preregistration or release threshold is changed. Integrating or fixing a
finding remains the core engine owner's work.
