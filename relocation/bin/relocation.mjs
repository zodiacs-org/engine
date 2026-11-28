#!/usr/bin/env node
// Build only this isolated project before running: npm run build.
import { main } from "../build/cli-main.js";

process.exitCode = await main(process.argv.slice(2));
