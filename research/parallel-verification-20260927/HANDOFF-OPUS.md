# Parallel verification handoff for Opus

Continue the core engine work from your own saved state. This package is optional,
separable research and acceptance material; it does not replace the existing
engine brief, preregistration, holdouts or release gates.

**Delivery target:** `zodiacs-org/engine`, branch
`codex/parallel-research-20260928`, with this package added only under
`research/parallel-verification-20260927/`. The frozen baseline is engine
`0.1.1-rc.10`, source `f5f33892a95cd0d6cd4a11a80e66f802b11bccfa`.
Its package SHA-256 is
`a377cdc8c12e25ff7de4fe95ddf77a4cdee8d2da97071b0f8454e340b374565c`.

**Initial delivery history:** the connected GitHub integration returned HTTP 403
(`Resource not accessible by integration`) on the first upload. No remote branch,
commit or PR was created at that time; the initial downloadable archive instead
provided an additions-only Git patch and isolated-worktree instructions.
Repository permissions have since been updated. This publication copy targets
the combined research branch above, alongside the accuracy audit and Verify
preview; the initial access failure does not describe its current delivery state.

No core/runtime source, existing dependency or lockfile, CI configuration, site
integration or release artifact was edited. The existing package file allowlist
excludes this research subtree. No merge or release is part of this delivery.
Unpushed changes in your paused session were not visible to this work.

## First run

From the engine repository checkout:

```sh
cd research/parallel-verification-20260927
python3 bootstrap.py \
  --tarball ../../artifacts/zodiacs-engine-0.1.1-rc.10.tgz \
  --runtime .runtime

node run-all.mjs \
  --engine .runtime/package/dist/index.js \
  --tarball ../../artifacts/zodiacs-engine-0.1.1-rc.10.tgz \
  --out run-output/rc10-first-run \
  --expect-baseline
```

The two `..` components are correct from this research directory to the
repository root. An absolute tarball path works as well. If the archive is not
available locally, omit `--tarball` from bootstrap: it downloads the exact pinned
artifact. Bootstrap verifies its hash, installs only the runtime dependency in
the isolated runtime, and refuses any nonempty runtime directory.
Installing that dependency needs npm access or a usable local cache even when
the tarball is supplied locally. Use Python with the `tarfile` data filter and
a supported Node runtime; this baseline was exercised on Node 24.19.0.

With default-download bootstrap, the archive for the second command is
`.runtime/zodiacs-engine-0.1.1-rc.10.tgz`. The comparison runners use saved
references offline. Choose a fresh `--out` directory for each run. Read its
`summary.json`, `target-identity.json`, individual JSON reports and logs; a
successful runner can still contain an explicitly classified API concern.

For a successor package, supply its module and artifact instead and omit
`--expect-baseline`. Preserve its own trusted source/artifact identity. Do not
rewrite the frozen reference files or thresholds to accommodate its results.

## What is ready

| Workstream | Delivered evidence and limit |
| --- | --- |
| `geometry/` | 1,300 gated ASC/MC comparisons passed across 685 chart inputs; ERFA-based orientation and original vector geometry. Additional polar ASC cases are diagnostic. Finite coverage, not a universal bound. |
| `events/` | Two independently acquired JPL lunation comparisons passed a predeclared 10-second diagnostic gate. Differences were approximately −2.96 and −3.80 seconds; these do not meet a universal two-second claim. Synthetic UT1 with pinned ΔT, not actual UTC phase timestamps. |
| `toolkit/` | 210/210 rows pass the predeclared 60-arcsecond diagnostic; 168 exceed the aspirational one-arcsecond target. Largest longitude residual: Pluto, 28.534631 arcseconds. Coordinate and target conventions differ, so this is not an absolute-accuracy or Swiss-parity claim. |
| `reproductions/` | One reproduced Saturn-return clock contract gap, one measured Moon illumination approximation, and five passing targeted controls. |
| `uncertainty/` | Specification, schemas, 25 contract controls and a working preview. The recorded preview made 3,602 engine calls. It reports sampled behavior, not proof that every instant in a continuous birth-time window agrees. |
| `historical-time/` | Five conditional legal regimes, six primary sources, eight boundary fixtures and 13 passing tests. Agent-reviewed research seed; no city applicability or human historical review is claimed. |

## Two concrete decisions for the core owner

**Saturn-return clock contract.** Passing a birth with pinned ΔT, or the chart
created from it, currently returns the unpinned natal Saturn target and the
entire unpinned result. A one-second override changed the natal chart's Saturn
by 0.00467813 arcsecond but left the return target unchanged. The existing return
documentation does not expressly promise override support. Choose either to
honor the supplied natal target, or to explicitly reject/document unsupported
overrides. Do not automatically apply one constant natal ΔT to every future
event. The minimal example and measured values are in
`reproductions/FINDINGS.md`.

**Moon illumination scope.** The public phase longitude is a legitimate
astrological convention. Its attached illumination is a longitude-only
approximation: the largest difference in 33 daily samples was 0.19867 percentage
points versus the same dependency's physical phase geometry on the same clock.
Either label this as approximate display illumination or calculate and validate
physical illuminated fraction separately. This is not independent ephemeris
validation or a demonstrated event-time defect.

## How to use the material without disrupting ongoing work

Run the external kit against the next candidate before considering integration.
Select useful acceptance cases individually; keep core ephemeris, precision
runtime, package contracts and release integration under your ownership. New
uncertainty or historical-time functionality needs its own reviewed contract
before import. The research examples are not production APIs or new release
requirements, and none claims a new discovery about astrology's predictive
validity.

Sources and redistribution boundaries are summarized in `NOTICE.md`; each
workstream retains its detailed provenance and scope.
