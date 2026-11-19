// App (b): natalChart from the root after setDefaultEphemeris("astronomy-engine").
import { natalChart, setDefaultEphemeris } from "@zodiacs/engine";
import { report } from "./report.js";

setDefaultEphemeris("astronomy-engine");
const chart = natalChart({ utc: "2000-01-01T12:00:00Z", latitude: 51.5, longitude: -0.1 });
report("b", { bodies: chart.bodies.length, moon: chart.bodies.find((body) => body.body === "moon")?.lon, ephemeris: chart.ephemeris?.name ?? null, flags: chart.flags });
