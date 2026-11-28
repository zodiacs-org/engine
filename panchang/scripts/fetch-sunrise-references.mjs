// Independent US Government numerical facts; never invoke the engine here.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const generated = new URL("../generated/", import.meta.url);
mkdirSync(generated, { recursive: true });
const cases = [
  { latitude: 12.5, longitude: 75.25, dates: ["2024-03-20", "2024-03-21"] },
  { latitude: -22.25, longitude: -60.75, dates: ["2024-06-21", "2024-06-22"] }
];
const days = [];
for (const site of cases) {
  for (const date of site.dates) {
    const url = `https://aa.usno.navy.mil/api/rstt/oneday?date=${date}&coords=${site.latitude},${site.longitude}&tz=0`;
    const raw = execFileSync("curl", ["--fail", "--silent", "--show-error", "--max-time", "45", url], { encoding: "utf8" });
    const response = JSON.parse(raw);
    const data = response.properties?.data;
    const rises = data?.sundata?.filter(({ phen }) => phen === "Rise");
    if (response.error || data?.tz !== 0 || data?.isdst !== false || rises?.length !== 1 ||
        `${data.year}-${String(data.month).padStart(2, "0")}-${String(data.day).padStart(2, "0")}` !== date ||
        response.geometry?.coordinates?.[0] !== site.longitude || response.geometry?.coordinates?.[1] !== site.latitude ||
        !/^\d{2}:\d{2}$/u.test(rises[0].time)) throw new Error("Unexpected USNO response");
    writeFileSync(new URL(`usno-${date}.json`, generated), raw);
    days.push({ date, observer: { latitude: site.latitude, longitude: site.longitude, height: 0 },
      riseUT: rises[0].time, weekday: data.day_of_week, url, apiVersion: response.apiversion,
      responseSHA256: createHash("sha256").update(raw).digest("hex") });
  }
}
const fixture = { provider: "US Naval Observatory, Complete Sun and Moon Data for One Day",
  retrieved: new Date().toISOString().slice(0, 10), sourceScale: "UT", resolution: "minute",
  licenseBasis: "US Government numerical facts; see repository LICENSING.md, Swiss Ephemeris exclusion",
  acceptanceSeconds: 60, days };
writeFileSync(new URL("usno-sunrise-reference.json", generated), `${JSON.stringify(fixture, null, 2)}\n`);
console.log("Wrote independent reference extracts and raw responses in panchang/generated/ for review.");
