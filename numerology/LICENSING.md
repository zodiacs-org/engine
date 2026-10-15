# Numerology licensing and authorship

Code, documentation, handwritten synthetic fixtures, and original reflection
prompts authored in this project use the repository's [MIT License](../LICENSE),
under the contribution terms in [CONTRIBUTING.md](../CONTRIBUTING.md).
This folder is a private local development project. It is excluded from the
engine npm package and does not alter the engine's licensing record.

| Material | Origin and terms |
| --- | --- |
| Library, CLI, tests, examples, documentation, and fixture prose | Authored for this project; MIT. |
| Latin, Greek, and Cyrillic scalar mappings | Authored finite spelling conventions, not a copied transliteration dataset; MIT as project code. |
| Pythagorean letter assignments | Implemented by repeating alphabetical arithmetic; no book prose or data file is included. |
| Chaldean letter assignments | Letter-value facts checked during implementation against the reference recorded in the README's name-number section. No interpretations, examples, birth data, scans, book prose, or transcription files are copied. |
| Meanings | Original prompts in `src/meanings.ts`, `src/derived.ts`, `src/periods.ts`, `src/profiles.ts`, and `src/name-numbers.ts`; MIT. |
| TypeScript development compiler | Locked in the local package lockfile; Apache-2.0 according to the installed compiler's `LICENSE.txt`. It is a development tool, not a runtime import. Its distribution retains its own notices and third-party notice file. |
| JavaScript runtime | Supplied by the developer, not redistributed as authored project source. Runtime and any local tool caches stay ignored and retain their own terms. |

The project has no runtime package dependencies. `test/isolation.test.mjs`
checks the declaration and local-only library import graph; the consumer
tests check that the built declarations work without external ambient types.
The installed compiler and runtime are not relicensed by this document.

The [conventions record](docs/CONVENTIONS.md) explains the table reference's
limited role. No claim about the copyright status of an online transcription
is needed for this implementation, and no interpretation is copied from it.
New external datasets or quoted text would need their own provenance review.

No Swiss Ephemeris code, binaries, tables, fixtures, or per-case outputs are
used here. No engine, conformance, atlas, ephemeris, time-scale, or place
dataset is copied into this project. This independent numerology code does
not inherit a data attribution requirement from an engine it does not import.
An application separately using the engine must retain that package's own
license and notices as described in the repository's [LICENSING.md](../LICENSING.md).
