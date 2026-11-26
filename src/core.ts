/**
 * `@zodiacs/engine/core`: the root entry under a second name, kept so that
 * code written for 2.x keeps its import. Until 2.1.0 it was the root's code
 * bundled on its own without the DE440 pack, with a default source and
 * settings of its own. From 3.0.0 the root itself computes on astronomy-engine
 * by default and holds no pack, so this entry re-exports it: the same
 * functions, the same module state (the default source, `withEphemeris`,
 * `useDe440()` from `@zodiacs/engine/de440/pack`). Import `@zodiacs/engine`
 * in new code; this entry may be removed in a later major version.
 */
export * from "./index.js";
