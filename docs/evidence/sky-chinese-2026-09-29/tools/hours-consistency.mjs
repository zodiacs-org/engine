// S4 consistency (PREREGISTRATION.md): at every S1 site and date where the Sun
// rises, sets and rises again, each planetary hour boundary must be sunrise +
// k (sunset − sunrise) / 12 or sunset + k (next sunrise − sunset) / 12 within
// 1 ms, those three instants must be the rise/set function's, and the rulers
// must follow the Chaldean order from the day's ruler.
// Usage: node hours-consistency.mjs OUT.json   (after npm run build)
import { writeFileSync } from "node:fs";
import { CHALDEAN_ORDER, PLANETARY_DAY_RULERS, planetaryHours, skyEvents } from "../../../../dist/sky.js";
import { CONVENTIONS, DATES, SITES } from "./grid.mjs";

const counts = { days: 0, complete: 0, polar: 0, refused: 0, hoursChecked: 0, failures: 0 };
const failures = [];
const fail = (what) => {
  counts.failures += 1;
  if (failures.length < 50) failures.push(what);
};
for (const convention of CONVENTIONS) {
  for (const site of SITES) {
    for (const date of DATES) {
      counts.days += 1;
      const day = planetaryHours(site, date, { ...convention.options, utcOffsetMinutes: 0 });
      counts[day.status] += 1;
      if (day.status !== "complete") continue;
      const marks = [day.sunrise.getTime(), day.sunset.getTime(), day.nextSunrise.getTime()];
      const events = skyEvents("Sun", site, marks[0] - 1, marks[2] + 1, convention.options).events
        .filter((event) => event.kind === "rise" || event.kind === "set")
        .map((event) => event.at.getTime());
      if (JSON.stringify(events) !== JSON.stringify(marks)) fail({ convention: convention.name, site, date, what: "rise/set", events, marks });
      if (day.ruler !== PLANETARY_DAY_RULERS[day.weekday]) fail({ convention: convention.name, site, date, what: "day ruler" });
      day.hours.forEach((hour, index) => {
        counts.hoursChecked += 1;
        const night = index >= 12;
        const k = index % 12;
        const from = marks[night ? 1 : 0];
        const step = (marks[night ? 2 : 1] - from) / 12;
        const startError = Math.abs(hour.start.getTime() - (from + k * step));
        const endError = Math.abs(hour.end.getTime() - (from + (k + 1) * step));
        if (startError > 1 || endError > 1) fail({ convention: convention.name, site, date, what: "boundary", index, startError, endError });
        if (hour.ruler !== CHALDEAN_ORDER[(CHALDEAN_ORDER.indexOf(day.ruler) + index) % 7]) fail({ convention: convention.name, site, date, what: "ruler", index });
      });
    }
  }
}
writeFileSync(process.argv[2], JSON.stringify({ counts, failures }, null, 1) + "\n");
console.log(JSON.stringify(counts));
