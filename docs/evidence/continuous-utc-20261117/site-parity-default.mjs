/*
 * Preloaded with `node --import` when the site's outputs are generated
 * (docs/evidence/techniques-2026-09-29/site-parity.mjs): sets the engine the
 * site's code runs on to astronomy-engine, the default
 * src/techniques/site-parity.test.ts runs on (src/test-setup.ts). Since
 * 1.1.0-rc.9 the package's own default is the DE440 pack, so without this the
 * outputs would be on another ephemeris than the test's.
 *
 *   ENGINE_PACKAGE=<the packed build's package/ directory> \
 *     node --import ./site-parity-default.mjs ../techniques-2026-09-29/site-parity.mjs ...
 *
 * On origin/main (373ceda) this reproduces all six committed site outputs
 * byte for byte apart from meta.engine.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = process.env.ENGINE_PACKAGE;
if (!dir) throw new Error("ENGINE_PACKAGE must name the packed build's package/ directory");
const { setDefaultEphemeris } = await import(pathToFileURL(join(dir, "dist", "index.js")).href);
setDefaultEphemeris("astronomy-engine");
