// App (a): natalChart from the root entry, as most callers write it.
import { natalChart } from "@zodiacs/engine";
import { report } from "./report.js";

const chart = natalChart({ utc: "2000-01-01T12:00:00Z", latitude: 51.5, longitude: -0.1 });
report("a", { bodies: chart.bodies.length, moon: chart.bodies.find((body) => body.body === "moon")?.lon, ephemeris: chart.ephemeris?.name ?? null, flags: chart.flags });
