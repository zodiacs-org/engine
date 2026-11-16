# 1.1.0: 1.1.0-rc.13 with the version changed

The release cut on 2026-11-16 from 1.1.0-rc.13 (merged in pull request
101). The owner accepted shipping the DE440 pack in writing on 2026-11-16,
as `LICENSING.md` required before publication, and the size budgets rc.12
raised were approved the same day under the owner's delegation. Nothing
here was tagged or published.

Machine: one Linux x86-64 host, Node 22.23.4 with npm 10.9.9.

## What changed against 1.1.0-rc.13

- The version string, 1.1.0-rc.13 to 1.1.0: `package.json`,
  `package-lock.json`, `ENGINE_VERSION` in `src/types.ts`, `typedoc.json`,
  the two tests that hold it, and in `src/fixtures/calc-roundtrip.json` the
  30 places that hold it.
- Packed documents: `CHANGELOG.md` (the 1.1.0 entry), `README.md` (the
  version line, the install section, the list of drafts, the unpacked size,
  the evidence folders) and `LICENSING.md` (the owner's acceptance of the
  DE440 pack, and the versions named in its note on the licence field).
  `LICENSE` and `NOTICE` are rc.13's byte for byte.
- `scripts/verify-package-contents.mjs`: a comment recording this release's
  size. No budget and not the cap.

## The build against rc.13's

`distcmp.py` lists every file of a `dist/` with its SHA-256, after naming each
hashed chunk file `chunk-H` (the bundler names chunks by their content, so the
version string renames the chunks that hold it) and, on the 1.1.0 side,
writing `"1.1.0-rc.13"` for `"1.1.0"`. On the `dist/` of rc.13's carried
archive and of this tree's pack: `results/dist-vs-rc13.txt`, 92 files each,
EQUAL. So the code is rc.13's but for the version string.

## Gates on this tree, Node 22.23.4

- `npm run typecheck`: passed (`results/typecheck.log`).
- `npm test`: 4,308 passed, 4 skipped, as rc.13's (`results/test.log`).
- `npm run exports:smoke`, `npm run api:check`, `npm run package:contents`
  (98 files, 4,580,765 bytes unpacked, 1,261,213 beside the pack, of the cap
  1,265,000): passed (`results/*.log`).
- The packed consumer on this tree's pack: passed
  (`results/consumer-v22.23.4.log`).
- Conformance: every verdict matches the committed results, and
  `RESULTS.md` and `results/summary.json` are current
  (`results/conformance.log`).
- Atlas: passed (`results/atlas.log`).
- The archive-binding check needs full history and the carried archive; it
  runs in CI and on the carrier.
