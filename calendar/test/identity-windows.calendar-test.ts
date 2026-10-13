import { describe, expect, it } from "vitest";
import { searchLongitudeCrossingsWith } from "../../src/crossings.js";
import type { BodyLongitudeAt } from "../../src/crossings.js";
import { currentEngineIdentity } from "../src/engine.js";
import { canonicalIdentityWindows, identifyEventBatch } from "../src/identity.js";
import type { IdentityWindow, ScheduleEvent, UnidentifiedEvent } from "../src/types.js";

const DAY_MS = 86_400_000;
const epoch = Date.parse("2026-02-01T00:00:00.000Z");
const instant = (days: number) => new Date(epoch + days * DAY_MS).toISOString();
const windowAt = (day: number): IdentityWindow => ({ startUtc: instant(day), endUtc: instant(day + 1) });

// Invented smooth circular motion exercises the parent solver and identity
// plumbing. These tests are regression checks, not astronomical accuracy evidence.
const syntheticMotion: BodyLongitudeAt<"Synthetic"> = (_body, at) => {
  const days = (at.getTime() - epoch) / DAY_MS;
  return ((90 + 720 * days + 10 * days ** 2) % 360 + 360) % 360;
};
const midnightMotion: BodyLongitudeAt<"Synthetic"> = (_body, at) => {
  const days = (at.getTime() - epoch) / DAY_MS;
  return ((90 + 360 * days) % 360 + 360) % 360;
};

/** Test adapter: assign identities to complete fixed days before display filtering. */
function exportRange(
  startUtc: string,
  endUtc: string,
  longitudeAt = syntheticMotion,
  queried: IdentityWindow[] = []
): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  for (const window of canonicalIdentityWindows(startUtc, endUtc)) {
    queried.push(window);
    const result = searchLongitudeCrossingsWith(longitudeAt, "Synthetic", 90,
      new Date(window.startUtc), new Date(window.endUtc), { stepDays: 1 / 32, maxSamples: 2_000 });
    if (result.status !== "complete") throw new Error("Synthetic test search exhausted its budget.");
    const candidates: UnidentifiedEvent[] = result.crossings.map((crossing) => ({
      summary: "Synthetic longitude crossing",
      chartIds: [],
      definition: {
        id: "synthetic-longitude-crossing/1",
        parameters: {
          motion: longitudeAt === midnightMotion ? "linear/1" : "quadratic-phase/1",
          targetLongitudeDegrees: 90,
          retrograde: crossing.retrograde
        }
      },
      receipt: {
        schema: "zodiacs-calendar-receipt/1",
        utc: crossing.at.toISOString(),
        eventType: "ingress",
        bodies: ["Synthetic"],
        aspect: null,
        orbDegrees: null,
        engine: currentEngineIdentity(),
        source: {
          synthetic: true,
          solver: "searchLongitudeCrossingsWith",
          samples: result.samples,
          retrograde: crossing.retrograde
        }
      }
    }));
    const identified = identifyEventBatch("synthetic-window-tests.calendar.invalid", {
      status: "complete", window, events: candidates
    });
    events.push(...identified.filter((event) => event.receipt.utc > startUtc && event.receipt.utc <= endUtc));
  }
  return events;
}

const identities = (events: readonly ScheduleEvent[]) => events.map(({ uid, identity, receipt }) => ({
  uid, identity, utc: receipt.utc
}));

describe("canonical identity windows with the engine crossing solver", () => {
  it("queries full UTC days independently of the requested endpoints", () => {
    const queried: IdentityWindow[] = [];
    const events = exportRange(instant(0.6), instant(2.3), syntheticMotion, queried);
    expect(queried).toEqual([windowAt(0), windowAt(1), windowAt(2)]);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.receipt.utc > instant(0.6) && event.receipt.utc <= instant(2.3))).toBe(true);
    expect([...canonicalIdentityWindows(instant(0.6), instant(2))]).toEqual([windowAt(0), windowAt(1)]);
  });

  it("retains the same identities when regenerating or changing overlapping ranges", () => {
    const broad = exportRange(instant(0), instant(3));
    const overlap = exportRange(instant(0.6), instant(2.3));
    const expected = broad.filter((event) => event.receipt.utc > instant(0.6) && event.receipt.utc <= instant(2.3));
    expect(identities(exportRange(instant(0), instant(3)))).toEqual(identities(broad));
    expect(identities(overlap)).toEqual(identities(expected));
    // The first visible pass is the day's second occurrence. Filtering first
    // would renumber it to zero and change its UID between these requests.
    expect(overlap[0]?.identity?.occurrence).toEqual({
      scheme: "utc-day-ordinal/1", startUtc: instant(0), ordinal: 1
    });
    expect(new Set(broad.map((event) => event.uid)).size).toBe(broad.length);
  });

  it("preserves event order and UIDs across different chunk boundaries", () => {
    const whole = exportRange(instant(0.15), instant(3.4));
    expect(whole.length).toBeGreaterThan(3);
    const atEvent = whole[1]!.receipt.utc;
    const partitions = [
      [instant(0.15), instant(1), instant(2), instant(3), instant(3.4)],
      [instant(0.15), instant(0.6), instant(1.7), instant(2.2), instant(3.4)],
      [instant(0.15), atEvent, instant(2.8), instant(3.4)]
    ];
    for (const edges of partitions) {
      const chunked = edges.slice(1).flatMap((end, index) => exportRange(edges[index]!, end));
      expect(identities(chunked)).toEqual(identities(whole));
      expect(new Set(chunked.map((event) => event.uid)).size).toBe(chunked.length);
    }
  });

  it("assigns an exact UTC midnight to the preceding day once", () => {
    const whole = exportRange(instant(0), instant(3), midnightMotion);
    expect(whole.map((event) => event.receipt.utc)).toEqual([instant(1), instant(2), instant(3)]);
    expect(whole.map((event) => event.identity?.occurrence)).toEqual([0, 1, 2].map((day) => ({
      scheme: "utc-day-ordinal/1", startUtc: instant(day), ordinal: 0
    })));
    const left = exportRange(instant(0.5), instant(1), midnightMotion);
    const right = exportRange(instant(1), instant(2.5), midnightMotion);
    expect(identities([...left, ...right])).toEqual(identities(whole.slice(0, 2)));
    expect(left.map((event) => event.receipt.utc)).toEqual([instant(1)]);
    expect(right.map((event) => event.receipt.utc)).toEqual([instant(2)]);
  });

  it("does not search an empty range and refuses reversed ranges", () => {
    const queried: IdentityWindow[] = [];
    expect(exportRange(instant(0.5), instant(0.5), syntheticMotion, queried)).toEqual([]);
    expect(queried).toEqual([]);
    expect([...canonicalIdentityWindows(instant(1), instant(1))]).toEqual([]);
    expect(() => exportRange(instant(1), instant(0), syntheticMotion, queried)).toThrow(RangeError);
    expect(queried).toEqual([]);
  });

  it("yields long ranges lazily without precomputing their remaining days", () => {
    const windows = canonicalIdentityWindows("0001-01-01T00:00:00.000Z", "9998-12-31T00:00:00.000Z");
    expect(windows.next()).toEqual({
      done: false,
      value: { startUtc: "0001-01-01T00:00:00.000Z", endUtc: "0001-01-02T00:00:00.000Z" }
    });
    expect(windows.return(undefined)).toEqual({ done: true, value: undefined });
  });
});
