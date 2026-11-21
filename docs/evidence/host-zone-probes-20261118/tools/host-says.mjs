import assert from "node:assert/strict";
import { resolveLocalToUtc } from "../../../../dist/geo.js";

assert.equal(process.versions.node, "22.22.2");
assert.equal(process.versions.tz, "2025c");

const date = "1979-05-26";
const time = "12:00";
const resolutions = ["Asia/Tehran", "Iran"].map((timeZone) => {
  const { utc, flags, zone } = resolveLocalToUtc(date, time, timeZone);
  return { timeZone, utc: utc.toISOString(), flags, hostCheck: zone.hostCheck };
});
for (const { utc, flags, hostCheck } of resolutions) {
  assert.equal(utc, "1979-05-26T08:30:00.000Z");
  assert.deepEqual(flags, ["host-zone-data-differs"]);
  assert.deepEqual(hostCheck, {
    status: "differs",
    probe: "1979-05-26T08:30:00.000Z",
    hostOffsetMinutes: 210,
    tzdbOffsetMinutes: 270,
    tzdbVersion: "2026f"
  });
}
console.log(JSON.stringify({
  node: process.versions.node,
  tz: process.versions.tz,
  icu: process.versions.icu,
  wall: `${date}T${time}`,
  resolutions
}, null, 2));
