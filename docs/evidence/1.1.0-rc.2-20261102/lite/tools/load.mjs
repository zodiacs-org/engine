// Shared by the lite entry's check tools (../PREREGISTRATION.md, section 3).
// `root` is a directory that holds a package.json and dist/: this checkout
// after `npm run build`, or the candidate installed in a scratch consumer
// (node_modules/@zodiacs/engine). Entries are imported by the file the
// package's "exports" names. Reads only the files it names.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** This checkout's root, five directories above this file. */
export const CHECKOUT = new URL("../../../../../", import.meta.url);

/** The package's manifest. */
export function manifest(root) {
  return JSON.parse(readFileSync(join(resolve(root), "package.json"), "utf8"));
}

/** The module an entry (".", "./lite", ...) of the package at `root` gives. */
export async function entry(root, subpath) {
  const target = manifest(root).exports[subpath];
  if (!target) throw new Error(`the package at ${root} exports no ${subpath}`);
  return import(pathToFileURL(join(resolve(root), target.import)).href);
}

/** `--name value` arguments as an object; a flag without a value is true. */
export function options(argv = process.argv.slice(2)) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--")) throw new Error(`unexpected argument ${name}`);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) out[name.slice(2)] = true;
    else {
      out[name.slice(2)] = next;
      index += 1;
    }
  }
  return out;
}

/** Writes a check's report to `out` (if given) and stdout; exits 1 when it did not pass. */
export function finish(report, out) {
  const text = `${JSON.stringify(report, null, 1)}\n`;
  if (out) writeFileSync(out, text);
  process.stdout.write(text);
  process.exitCode = report.pass ? 0 : 1;
}

/** 32-bit FNV-1a of a string's UTF-16 code units. */
export function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** mulberry32: uniform doubles in [0, 1). */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Whether two values are the same: Object.is on every leaf, and for arrays
 * and objects the same prototype, the same keys in the same order and the
 * same length. Returns null when they are, else the path of the first
 * difference.
 */
export function difference(a, b, path = "") {
  if (Object.is(a, b)) return null;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return path || "(value)";
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return `${path} (prototype)`;
  const keys = Object.keys(a);
  const other = Object.keys(b);
  if (keys.length !== other.length || keys.some((key, index) => key !== other[index])) return `${path} (keys)`;
  for (const key of keys) {
    const found = difference(a[key], b[key], `${path}.${key}`);
    if (found !== null) return found;
  }
  return null;
}

/** What a call gives: its value, or the class and message of what it throws. */
export function attempt(run) {
  try {
    return { value: run() };
  } catch (error) {
    return { error: error instanceof Error ? error.constructor.name : typeof error, message: String(error?.message ?? error) };
  }
}
