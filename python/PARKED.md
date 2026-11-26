# Parked at @zodiacs/engine 3.0.0

The Python package in this folder, `zodiacs` 0.1.0a1, is parked from
`@zodiacs/engine@3.0.0`. It stays pinned to the `@zodiacs/engine`
0.1.1-rc.14 archive it vendors, with astronomy-engine 2.1.19
(`src/zodiacs/_vendor/manifest.json` records both archives and their
SHA-256). It is not maintained, not tested against and not published for
3.0.0.

What that means:

- No change after 0.1.1-rc.14 reaches it, 3.0.0's included: not
  `useDe440()` and the DE440 pack, not True Black Moon Lilith, not
  `@zodiacs/engine/minor-bodies`, and none of the 1.x and 2.x changes in
  between.
- Its [README](README.md) describes the package as it was prepared for
  0.1.1-rc.14, and its tests check that archive, not 3.0.0.
- No release of it is made for 3.0.0, on PyPI or anywhere else.

To compute with 3.0.0, use the npm package itself:
`npm install @zodiacs/engine` (the repository's README). Moving this package
to a current engine, testing it again and deciding whether to publish it
waits for the owner's decision.
