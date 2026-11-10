# DE440 entry (1.1.0-rc.3): evidence

What `docs/de440.md` and `CHANGELOG.md` state about `@zodiacs/engine/de440`,
and where each statement comes from.

## The oracles of `src/de440-kernel.test.ts`

`oracles/erfa-places.json` (SHA-256
`7d56d6ea938cd90df04a5b902f3ff3fddd5d3535efc886d2dac1fd9dc58831cd`) and
`oracles/erfa-nodes.json`
(`f8091b4dff24507486af2bfeee56af55f389671db5c96ecf3a9f788408db7213`) are
copied unchanged from zodiacs.org's repository (zodiacs-org/site, commit
4fa9ffbf, `docs/platform/evidence/de440-hosted-20261109/oracles/`), where its
programme unit P4.1 preregistered them before any code of this entry existed.
They are an ERFA chain (pyerfa 2.0.1.5, ERFA 2.0.1, Python 3.11.16, numpy
2.4.6) over NAIF's `de440.bsp`, its states evaluated in exact rational
arithmetic: the apparent geocentric ecliptic places of date of ten bodies at
200 TT instants drawn by a fixed rule from 1800 to 2200, and the true node at
the same instants. The generator and its two self-checks are in that folder of
zodiacs.org's repository. The test checks both files' digests before it uses
them.

## The pack

The digests in `docs/de440.md` are the ones zodiacs.org's P4.2 recorded for
compiler 2.0.0 on `de440.bsp` with `--fromYear=1790 --toYear=2210`
(`docs/platform/evidence/pack-compiler-20261031/results/m21.json` in its
repository): 2,489,632 bytes compiled (SHA-256 `08b5d1a2...9b62`), 2,489,664
sealed (`51428874...1fa7`). Rebuilt on macOS arm64 on 9 November 2026, and on
Linux x86-64 in its CI the same day (zodiacs-org/site run 42663807980, the
workflow `precision-pack.yml`), both files came out byte for byte the same.

## The pack's own error

`pack-accuracy.json` is `tools/pack-accuracy.ts` run on 10 November 2026
(Node 22.22.2, macOS arm64) on that sealed pack and NAIF's `de440.bsp`, both
checked by digest: the reduction on the pack against the same reduction on
the raw kernel at 20,001 TT instants from 1800 to 2200 (`dense`), and against
the oracles at their 200 instants (`oracles`), by ten bodies and the true
node, with the pack's own per-body budgets and proven errors from its header
(`packBodies`). `docs/de440.md` and `CHANGELOG.md` quote its maxima, rounded
up. zodiacs.org's tier B checks the pack it builds against the oracles.

## Sizes

`sizes.json` (`../rc16-20260930/sizes.mjs`) measures the carried 1.1.0-rc.2
archive and the build of this candidate's tree (Node 22.22.2, darwin-arm64):
each entry point's import graph, in bytes, against its budget in
`scripts/verify-package-contents.mjs`, and the package.

## The checks

What is enforced, and where:

- `src/de440.test.ts` and `src/de440-format.test.ts`, on synthetic packs
  (float64 records, and quantised records written by an independent writer
  with every field width the reader accepts): the digest and trailer checks,
  the reader's decoding and record selection, the Sun-relative body and the
  Earth-Moon system, the switch and its nesting, the refusals of the entries
  that compute their own positions, and the receipts.
- `src/de440-sources.test.ts`: no astronomy-engine position function is
  called under a DE440 source, in the calls zodiacs.org's compute API makes.
- `src/de440-kernel.test.ts`, with PRECISION_KERNEL set (CI's tier-B job
  fetches the kernel from NAIF and checks its digest): the reduction on the
  raw kernel within 1e-6″ of the oracles, place and node, and the node's
  control.

Not enforced here: the pack's size, digest and reproducibility (zodiacs.org's
P4.2 record and its CI, above), the pack's own error (measured, above), and
that the port gives the research runtime's numbers bit for bit, which
zodiacs.org's check C9 compares.
