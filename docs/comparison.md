# Comparison with other engines

All position accuracy figures below come from the same open 240-vector Level L1
suite (24 instants from 1851 to 2148, Sun through Pluto, compared with NASA JPL
Horizons DE441 at a 1″ tolerance) in [conformance/RESULTS.md](../conformance/RESULTS.md).
Any engine can be measured against the same vectors through a small adapter
([conformance/SUBMITTING.md](../conformance/SUBMITTING.md)).

| Engine | Licence | Runtime | L1 positions within 1″ of JPL DE441 | Lon median / max | Bundle or ephemeris footprint |
| --- | --- | --- | --- | --- | --- |
| `@zodiacs/engine` 2.0.0 (DE440 default) | MIT AND CC-BY-4.0 | JS/TS (browser, Node, Deno, Bun) | 240 / 240 | 0.002″ / 0.013″ | about 3.42 MB minified (about 2.28 MB brotli); zero runtime network calls |
| `@zodiacs/engine/core` 2.0.0 (`astronomy-engine`) | MIT AND CC-BY-4.0 | JS/TS (browser, Node, Deno, Bun) | 48 / 240 | 2.083″ / 18.774″ | 77 to 80 KB minified (29 to 31 KB brotli); lazy DE440 pack optional |
| Swiss Ephemeris 2.10.03 | AGPL-3.0 or commercial | C (native bindings) | 240 / 240 | 0.001″ / 0.005″ | Native C library plus external `.se1` ephemeris files |
| Skyfield 1.55 (`de440s.bsp`) | MIT | Python + NumPy | 240 / 240 | 0.001″ / 0.013″ | Python package plus external JPL BSP file (`de440s.bsp`) |
| astronomia 4.3.0 (VSOP87B) | MIT | JS (Node, browser) | 176 / 192 answered (48 unsupported) | 0.238″ / 2.782″ | JS package with VSOP87B planet tables |
| PyEphem 4.2.1 | MIT | Python / C (`libastro`) | 36 / 240 | 0.415″ / 25.889″ | Python package wrapping XEphem's `libastro` C library |

## Notes

- `@zodiacs/engine` bundle figures were measured across esbuild 0.28.2, Rollup 4.67.4,
  Vite 8.3.5 and webpack 5.112.2 in production mode (see *Bundle size in a web page*
  in [README.md](../README.md) and `docs/evidence/bundle-weight-20261117/`).
- Swiss Ephemeris results in the conformance suite are published as verdicts and
  summary statistics only.
- `astronomia` 4.3.0 answers 8 planets via VSOP87B and marks Moon and Pluto
  unsupported in the adapter.
- This document lives under `docs/` so the immutable `2.0.0` package archive
  (`artifacts/zodiacs-engine-2.0.0.tgz`) continues to reproduce byte for byte;
  the table can also be included in `README.md` when the next package version
  is cut.
