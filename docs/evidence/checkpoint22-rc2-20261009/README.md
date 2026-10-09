# Checkpoint 22: rc.2 packed API gate preparation

This directory refreshes the programme's P3.2 checks for the carried
`1.0.0-rc.2` archive. It changes no packed file, version, calculation,
accuracy expectation, archive, or publication state.

The workflow `.github/workflows/checkpoint22.yml` installs the carried
archive into an isolated temporary consumer after verifying its exact
SHA-256 and size. It compiles the declaration contract, checks each
deliberate declaration fault against its named assertion, replays the
source-bound fixtures and receipt requests, compares sidereal options
with the Vedic entry, and checks all four functions at and beyond the
inclusive epoch bounds on TT, UT1 and UTC with zero Delta-T.

The round-trip and entry-to-entry comparisons are regression/contract
evidence. Independent epoch accuracy evidence remains
`../calc-epochs-2026-10-06/`; these tools do not regenerate its expectations.

The owner's F-80 interpretation is the October 6 decision already
recorded in the site programme: a precession-carried caller epoch inside
`EPHEMERIS_SPAN` is supported, and an epoch beyond it has the discriminated
`epoch-out-of-range` refusal. The early epoch that rc.17 refused is
therefore expected to compute in this candidate.

## Observed result

[Checkpoint run 37889579009](https://github.com/zodiacs-org/engine/actions/runs/37889579009),
job 113687217114, passed at tool source
`832ecb5f84eabf8b98c61a8990416e28e1cbca7d`. The committed
`results/` records were recovered from that job's structured export and
verified against its SHA-256 and byte count:

- declaration control compiled, and every one of 21 faults was refused at
  its named assertion;
- 38 synthetic fixture cases and 27 receipt requests replayed with no
  mismatch and zero relative difference;
- all 21 sidereal definitions computed in the four functions, with no
  sweep failure;
- 72 inclusive-end checks computed and 72 beyond-end checks returned the
  typed epoch refusal, across three models, three scales and four functions.

These counts are enforced by the committed tools and recorded in their
outputs. The full engine CI, conformance, atlas and Python suites remain
required on the final evidence commit. This evidence does not grant
programme acceptance or clear stable publication.

Private birth-data search inputs from the previous executor are
unavailable here. No new private search was run. The affected release
searches remain required before release; only synthetic inputs and
existing public records are used by these tools.

## Reproduction

Run the workflow on a review branch. For local reproduction, install the
carried archive in a temporary directory outside the checkout, copy only
this directory's `tools/`, and supply the checkout's pinned TypeScript,
Node declarations and undici declarations as the workflow does. Then run
its declaration check and four tools in the same order. The fixture
argument must name `src/fixtures/calc-roundtrip.json` from rc.2's source.
