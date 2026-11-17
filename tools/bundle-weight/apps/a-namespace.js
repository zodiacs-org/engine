// Edge case: app (a) written with a namespace import, to see whether a
// bundler keeps the pack ("sideEffects": false does not let it drop a
// module whose export is used).
import * as engine from "@zodiacs/engine";
import { report } from "./report.js";

const chart = engine.natalChart({ utc: "2000-01-01T12:00:00Z", latitude: 51.5, longitude: -0.1 });
report("a-namespace", { bodies: chart.bodies.length, moon: chart.bodies.find((body) => body.body === "moon")?.lon, ephemeris: chart.ephemeris?.name ?? null, flags: chart.flags });
