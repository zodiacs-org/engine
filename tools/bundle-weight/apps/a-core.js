// App (a) against the prototype's pack-free entry, @zodiacs/engine/core
// (docs/evidence/bundle-weight-*/prototype.patch). Only an archive built
// with that patch has the entry.
import { natalChart } from "@zodiacs/engine/core";
import { report } from "./report.js";

const chart = natalChart({ utc: "2000-01-01T12:00:00Z", latitude: 51.5, longitude: -0.1 });
report("a-core", { bodies: chart.bodies.length, moon: chart.bodies.find((body) => body.body === "moon")?.lon, ephemeris: chart.ephemeris?.name ?? null, flags: chart.flags });
