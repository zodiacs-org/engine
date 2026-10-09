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

Results are initially Actions artifacts. Commit the actual successful
records before linking them as programme acceptance evidence. This
preparation does not grant acceptance or clear stable publication.

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
