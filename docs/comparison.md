# Comparison with other engines

All position accuracy figures below come from the same open 240-vector Level L1
suite (24 instants from 1851 to 2148, Sun through Pluto, compared with NASA JPL
Horizons DE441 at a 1″ tolerance) in [conformance/RESULTS.md](../conformance/RESULTS.md).
Any engine can be measured against the same vectors through a small adapter
([conformance/SUBMITTING.md](../conformance/SUBMITTING.md)).

| Engine | Licence | Runtime | L1 positions within 1″ of JPL DE441 | Lon median / max | Bundle or ephemeris footprint |
| --- | --- | --- | --- | --- | --- |
| `@zodiacs/engine` 3.0.0, default (`astronomy-engine`) | MIT AND CC-BY-4.0 | JS/TS (browser, Node, Deno, Bun) | 48 / 240 | 2.083″ / 18.774″ | 79,787 bytes minified, 36,213 gzipped (esbuild, `natalChart`; 3.0.0's build); no DE440 data; zero runtime network calls |
| `@zodiacs/engine` 3.0.0 after `useDe440()` | MIT AND CC-BY-4.0 | JS/TS (browser, Node, Deno, Bun) | 240 / 240 | 0.002″ / 0.013″ | 3,419,715 bytes minified, 2,441,049 gzipped (esbuild, `natalChart` and `useDe440`; 3.0.0's build), the sealed pack included; zero runtime network calls |
| Swiss Ephemeris 2.10.03 | AGPL-3.0 or commercial | C (native bindings) | 240 / 240 | 0.001″ / 0.005″ | Native C library plus external `.se1` ephemeris files |
| Skyfield 1.55 (`de440s.bsp`) | MIT | Python + NumPy | 240 / 240 | 0.001″ / 0.013″ | Python package plus external JPL BSP file (`de440s.bsp`) |
| astronomia 4.3.0 (VSOP87B) | MIT | JS (Node, browser) | 176 / 192 answered (48 unsupported) | 0.238″ / 2.782″ | JS package with VSOP87B planet tables |
| PyEphem 4.2.1 | MIT | Python / C (`libastro`) | 0 / 240 (all 240 unsupported) | none | Python package wrapping XEphem's `libastro` C library |

## Notes

- Both `@zodiacs/engine` 3.0.0 rows were measured on 3.0.0's build on 26
  November 2026 ([evidence/3.0.0-readme-20261126/](evidence/3.0.0-readme-20261126/)).
  Its conformance runs, after `useDe440()` and on astronomy-engine, give every
  verdict and every residual that the committed results record
  (`conformance/results/zodiacs-engine.json` and
  `zodiacs-engine-astronomy-engine.json`, which `conformance/RESULTS.md`
  labels 2.1.0), to the bit. The sizes are esbuild 0.27.7 browser bundles,
  minified, gzipped at level 9; Rollup, Vite and webpack were not run on
  3.0.0. Bun, Deno and the browsers were last checked on 2.0.0
  (`docs/evidence/runtime-conformance-2.0.0-20261121/`).
- Up to 2.1.0 the DE440 pack was the root's default, and every bundle of the
  root carried it. Measured on `2.0.0-rc.3`'s archive with esbuild 0.28.2,
  Rollup 4.67.4, Vite 8.3.5 and webpack 5.112.2 in production mode
  (`docs/evidence/2.0.0-rc.3-20261117/results/bundle-weight/results.json`;
  [guide.md](guide.md), *Bundle size in a web page*): a page of the root's
  `natalChart` was about 3.42 MB minified and about 2.28 MB with brotli, and
  of `@zodiacs/engine/core`, then a copy of the root's code without the pack,
  77 to 80 KB minified and 29 to 31 KB with brotli. Those figures are brotli,
  not gzip, and were not measured on 3.0.0.
- Swiss Ephemeris results in the conformance suite are published as verdicts
  and summary statistics only.
- `astronomia` 4.3.0 answers 8 planets via VSOP87B and marks Moon and Pluto
  unsupported in the adapter.
- PyEphem 4.2.1 gives apparent geocentric right ascension and declination,
  and its ecliptic conversion uses the mean obliquity, where every L1 vector
  needs the true obliquity of date, so its adapter reports all 240 as
  unsupported (`conformance/results/pyephem.notes.md`). Until 3.0.0 this
  table gave 36 / 240 and 0.415″ / 25.889″, the verdicts of the adapter as
  first committed (`f5f7ea76`), which answered on the mean obliquity; the
  adapter's next commit (`e24174ce`) reports those vectors as unsupported,
  and the committed results have done so since.
- From 3.0.0 the same table, shortened, is in [README.md](../README.md).
