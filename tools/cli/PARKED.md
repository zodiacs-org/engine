# Parked at @zodiacs/engine 3.0.0

The offline command line tool in this folder, the private `@zodiacs/cli`
0.0.0, is parked from `@zodiacs/engine@3.0.0`. It stays pinned to the carried
`@zodiacs/engine@1.0.0-rc.2` archive (its `peerDependencies`, and the
conformance baseline in `baselines/engine-1.0.0-rc.2-node-22.22.2.json`). It
is not maintained, not tested against and not published for 3.0.0.

What that means:

- No 3.0.0 change reaches it: not the astronomy-engine default with
  `useDe440()` for DE440, not True Black Moon Lilith, not
  `@zodiacs/engine/minor-bodies`, not loading through `require()`.
- Its [README](README.md) describes the tool as it was prepared for
  1.0.0-rc.2. The `offline-cli.yml` workflow still checks it against that
  archive when this folder changes, and that check says nothing about 3.0.0.
- It was never published to npm, and `npx @zodiacs/cli` is not an install
  this repository supports.

To compute with 3.0.0 from a program, use the package itself:
`npm install @zodiacs/engine` (the repository's README). Moving the tool to
a current engine, testing it again and deciding whether to publish it waits
for the owner's decision.
