// Native Node source-checkout execution; no output in the parent package.
import { register } from "node:module";
register("./resolve-source.mjs", import.meta.url);
