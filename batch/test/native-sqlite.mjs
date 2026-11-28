// Vitest's older ESM loader does not recognize this prefix-only builtin.
import { createRequire } from "node:module";
export const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
