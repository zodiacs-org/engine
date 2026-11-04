/**
 * `@zodiacs/engine/lite`: declination parallels, the sect under a named
 * convention, composite midpoints and their aspects, and the essential
 * dignities, for a program that must not load the ephemeris. Each of its four
 * parts (src/lite/declinations.ts, sect.ts, composite.ts and dignities.ts) is
 * built into a file of its own under dist/ that imports nothing, and
 * dist/lite.js re-exports the four (scripts/build-lite.mjs). The sect part is
 * new (src/sect.ts); every function and table of the other three is a copy of
 * the root's or `@zodiacs/engine/techniques`', with the same results, and not
 * the same object. See docs/lite.md.
 *
 * The build reads this file: it holds these four export lines and nothing
 * else.
 *
 * @module
 */
export * from "./lite/declinations.js";
export * from "./lite/sect.js";
export * from "./lite/composite.js";
export * from "./lite/dignities.js";
