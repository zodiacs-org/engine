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

## The checks

`src/de440.test.ts`, `src/de440-sources.test.ts` and, with PRECISION_KERNEL
set, `src/de440-kernel.test.ts` enforce what `docs/de440.md` says the entry
does; CI's job for tier B fetches the kernel from NAIF, checks its digest and
runs the last.
