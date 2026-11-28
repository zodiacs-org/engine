#!/usr/bin/env node
import { register } from "node:module";

// Private source-checkout runner. All tooling is installed in draconic/;
// transpilation stays in memory and never writes the engine's dist/.
register(new URL("../scripts/source-loader.mjs", import.meta.url));
await import("../src/cli-main.ts");
