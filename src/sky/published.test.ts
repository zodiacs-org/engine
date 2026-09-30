import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { skyEventsOn } from "../sky.js";

const usno = JSON.parse(readFileSync(new URL("./fixtures/usno-rstt.json", import.meta.url), "utf8")) as {
  days: { latitude: number; longitude: number; date: string; events: ["Sun" | "Moon", string, string][] }[];
};

describe("rise, set and transit against the US Naval Observatory", () => {
  it("falls within 30 s of USNO's minute (UT) for the Sun and the Moon at three places", () => {
    let checked = 0;
    for (const day of usno.days) {
      for (const [body, kind, time] of day.events) {
        const place = { latitude: day.latitude, longitude: day.longitude };
        const events = skyEventsOn(body, place, day.date, { utcOffsetMinutes: 0 }).events.filter((event) => event.kind === kind);
        const published = Date.parse(`${day.date}T${time}:00Z`);
        const nearest = Math.min(...events.map((event) => Math.abs(event.at.getTime() - published)));
        expect(nearest).toBeLessThanOrEqual(30_000);
        checked += 1;
      }
    }
    expect(checked).toBe(16);
  });
});
