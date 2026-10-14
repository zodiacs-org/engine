import assert from "node:assert/strict";
import { luminarySnapshot } from "../src/index.js";

// Exercise the actual source runtime, independently of Vite's test alias.
const snapshot = luminarySnapshot("2020-01-01T00:00:00Z");
if (snapshot.status !== "ok") throw new Error(snapshot.engine.reason);
assert.equal(snapshot.utc, "2020-01-01T00:00:00.000Z");
assert.equal(snapshot.ayanamsa.name, "lahiri");
assert.equal(snapshot.moon.sidereal.receipt.engine.ephemeris.version, "2.1.19");
console.log("Source runtime loads the engine adapter and its locally pinned dependency.");
