# Secondary progression site-adoption handoff

This rc.12 checkpoint prepares an engine candidate. The deployed site remains
on rc.10. Phase 2E (the site imports packaged techniques) is therefore partial;
the package work must not be represented as completed site adoption.

## Proposed adapter

`site-adapter.patch` replaces only the site's secondary-progression formula
and planetary delegation. It preserves the existing `Date`-argument signatures,
projects package rows through the existing `adaptBody`, and retains the twelve
rows, including both true lunar nodes. The site's result continues to contain
only `body`, `lon`, `lat`, `speed`, and `retrograde`; package `sign` and `degree`
fields do not leak into the consumer shape.

ChartLens must retain its existing dynamic import of the progression module.
Neither this patch nor its verification changes the actual site checkout.

## Frozen source and compatibility check

The source is the site merge `f2bd0dd45947ff392d0de1135695f584a71bfa08`, whose
tree is `bb92c6ef5a6794526614c10b0332dc56b41a4c90`. If the merge object is not
locally available, the checker permits only the already verified local commit
`ba78d143f2397f26661bb72008d57c00ed346316` with that identical tree. It reads
git objects, never mutable worktree files, and records every source hash.

Run after the rc.12 archive has been frozen:

```sh
node docs/evidence/rc12-20260928/verify-site-adoption.mjs \
  /absolute/path/to/site-checkout \
  /absolute/path/to/zodiacs-engine-0.1.1-rc.12.tgz \
  docs/evidence/rc12-20260928/site-adoption-parity.json
```

The harness installs the frozen rc.10 archive and the candidate archive into
separate physical temporary dependencies. It transpiles the actual site
progression module, full engine adapter and body projection, then applies the
proposed patch only to the temporary candidate copy. Both package graphs receive
the same ordered calls. It checks exact milliseconds and full projected body
rows across historical, leap-day, zero-age, pre-birth and negative-epoch cases.
Additional full-Date-range cases test mapping arithmetic without attempting
planetary computations at extreme epochs. No source or dependency symlinks are
used. The report is `site-adoption-parity.json` after successful execution.

This is compatibility evidence within the same astronomy-engine family, not an
independent astrometric precision certificate or a published worked progression
example. Invalid Date behavior need not match: rc.12 deliberately validates
inputs and accepts the engine's documented additional DateInput forms.

The frozen candidate check passed on Node v24.19.0 at
`2026-09-28T10:47:46.345Z`, against archive SHA-256
`c4cf150fe8fb0b37f5769993c2e63275b2e5ef47b97d8a118aff3be00ebaf7f0`.
It read the actual merged site commit. All 85 body cases matched exactly,
including all 1,020 projected rows; another 321 arithmetic-only mappings also
matched exactly. There were zero instant or body mismatches. The full report
records the original source hashes and the exact proposed adapter patch hash.

## Coherent adoption checkpoint

The adapter change is small; changing the site's engine candidate is a coupled
release operation. The follow-up PR should complete all of these together:

- Vendor the exact reviewed rc.12 archive, checksum and package-lock integrity.
- Apply the adapter and verify ordinary and before-birth progression behavior.
- Update candidate source/artifact/evidence metadata to immutable commits.
- Rebuild and version the local MCP bundle, package metadata, shrinkwrap,
  downloadable archive and manifest; retain older immutable archives.
- Refresh generated API documentation, install examples and candidate evidence
  references without overwriting historical validation records.
- Run the site engine suite, artifact and receipt compatibility checks, and a
  production build with its actual feature configuration. Check dynamic-import
  isolation and the existing birth-chart bundle budget. The rc.10 build had
  approximately 70.4 KiB against a 71 KiB budget, so rc.11/rc.12 shared chunks
  need measurement even when the new APIs are not used by other pages.
- Verify the deployed consumer progression lens and its responsive rendering
  after adoption. Preserve the existing self-hosted fonts and page design.

Do not update only the engine version string or only the site adapter: that
would leave the downloadable MCP package, manifests or generated documentation
describing different bytes. The engine candidate remains useful and reviewable
while this larger adoption checkpoint is pending.
