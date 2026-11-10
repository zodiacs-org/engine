import { readFileSync } from "node:fs";
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { createEventIdentity, eventUid, identifyEventBatch, serializeCalendar } from "../src/index.js";
import type { EventIdentity, IdentityWindow, JsonObject, ScheduleEvent, UnidentifiedEvent } from "../src/types.js";
import { fixtureOptions, syntheticEvents } from "./fixtures/synthetic-events.js";
import { identifiedSyntheticEvents, syntheticIdentities } from "./fixtures/synthetic-identities.js";

const identity = syntheticIdentities[0]!;
const transit = identifiedSyntheticEvents[0]!;
const interval = identifiedSyntheticEvents[1]!;
const window: IdentityWindow = { startUtc: "2026-02-03T00:00:00.000Z", endUtc: "2026-02-04T00:00:00.000Z" };
const unidentified = (utc = transit.receipt.utc): UnidentifiedEvent => ({
  summary: transit.summary, receipt: { ...transit.receipt, utc },
  chartIds: identity.chartIds, definition: identity.definition
});
const identify = (events: readonly UnidentifiedEvent[]) =>
  identifyEventBatch(identity.namespace, { status: "complete", window, events });
const encode = (event: ScheduleEvent) => serializeCalendar([event], fixtureOptions);

describe("versioned event identities", () => {
  it("pins UIDs and identity X-properties in the reviewed golden feed", () => {
    const golden = readFileSync(new URL("./fixtures/synthetic-identities.ics", import.meta.url));
    const output = serializeCalendar(identifiedSyntheticEvents, fixtureOptions);
    expect(Buffer.from(output)).toEqual(golden);
    const components = new ICAL.Component(ICAL.parse(output)).getAllSubcomponents("vevent");
    components.forEach((component, index) => {
      const expected = identifiedSyntheticEvents[index]!;
      const event = new ICAL.Event(component);
      expect(event.uid).toBe(expected.uid);
      const restored = JSON.parse(component.getFirstPropertyValue("x-zodiacs-identity") as string) as EventIdentity;
      expect(restored).toEqual(expected.identity);
      expect(eventUid(restored)).toBe(event.uid);
      expect(JSON.parse(event.description)).toEqual(syntheticEvents[index]!.receipt);
    });
    for (const line of output.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });

  it("ignores object insertion order, including integer-like and Unicode parameter names", () => {
    const a = { ...identity, definition: { id: "synthetic/1", parameters: { z: [1, { 月: true, a: null }], 2: "two", 10: "ten" } } };
    const b = { ...identity, definition: { parameters: { 10: "ten", 2: "two", z: [1, { a: null, 月: true }] }, id: "synthetic/1" } };
    expect(eventUid(a)).toBe(eventUid(b));
    expect(eventUid({ ...a, definition: { ...a.definition, parameters: { z: [2, 1] } } }))
      .not.toBe(eventUid({ ...a, definition: { ...a.definition, parameters: { z: [1, 2] } } }));
  });

  it("detaches and deeply freezes identity inputs without freezing caller data", () => {
    const input = JSON.parse(JSON.stringify(identity));
    const copy = createEventIdentity(input);
    const uid = eventUid(copy);
    input.bodies.reverse();
    input.chartIds[0] = "synthetic-chart-b/config-1";
    input.definition.parameters.direction = "retrograde";
    input.occurrence.key = "another-pass";
    expect(eventUid(copy)).toBe(uid);
    expect(copy).toEqual(identity);
    for (const value of [copy, copy.bodies, copy.chartIds, copy.definition, copy.definition.parameters, copy.occurrence]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Object.isFrozen(input)).toBe(false);
  });

  it.each([
    { namespace: "https://calendar.invalid/other" },
    { eventType: "synastry-exact", chartIds: ["synthetic-chart-a/config-1", "synthetic-chart-b/config-1"] },
    { bodies: ["Sun", "Moon"] },
    { chartIds: ["synthetic-chart-b/config-1"] },
    { chartIds: ["synthetic-chart-a/config-2"] },
    { aspectAngleDegrees: 120 },
    { definition: { ...identity.definition, id: "synthetic-transit/2" } },
    { definition: { ...identity.definition, parameters: { ...identity.definition.parameters, branch: 270 } } },
    { definition: { ...identity.definition, parameters: { ...identity.definition.parameters, direction: "retrograde" } } },
    { occurrence: { scheme: "source-key/1", key: "synthetic-pass-b" } },
    { occurrence: { scheme: "utc-day-ordinal/1", startUtc: window.startUtc, ordinal: 0 } }
  ])("separates semantic identity changes: %j", (patch) => {
    expect(eventUid({ ...identity, ...patch } as EventIdentity)).not.toBe(eventUid(identity));
  });

  it("preserves ordered chart roles even with identical body names", () => {
    const a: EventIdentity = {
      ...identity, eventType: "synastry-exact", bodies: ["Sun", "Sun"],
      chartIds: ["synthetic-chart-a/config-1", "synthetic-chart-b/config-1"]
    };
    expect(eventUid(a)).not.toBe(eventUid({ ...a, chartIds: [...a.chartIds].reverse() }));
  });

  it("retains source-key UIDs when labels, revision, precision, or receipt provenance change", () => {
    const revised: ScheduleEvent = {
      ...transit, summary: "Renamed synthetic chart: carré 月",
      receipt: {
        ...transit.receipt, utc: "2026-02-04T00:00:00.001Z", orbDegrees: 0.000002,
        aspect: { name: "carré", angleDegrees: 90 },
        engine: { ...transit.receipt.engine, version: "1.0.1" },
        source: { queryWindow: { from: window.startUtc, to: window.endUtc }, evaluations: 123 }
      }
    };
    const output = serializeCalendar([revised], { dtstamp: "2026-02-05T00:00:00.000Z" });
    const parsed = new ICAL.Event(new ICAL.Component(ICAL.parse(output)).getFirstSubcomponent("vevent")!);
    expect(parsed.uid).toBe(transit.uid);
    expect(parsed.summary).toBe(revised.summary);
    expect(JSON.parse(parsed.description)).toEqual(revised.receipt);
    // A source key also survives display clipping of an interval.
    expect(() => encode({ ...interval, receipt: { ...interval.receipt, utc: "2026-02-04T03:00:00.000Z" } })).not.toThrow();
  });

  it.each([
    { schema: "zodiacs-calendar-event/2" }, { namespace: "" }, { namespace: "x\ny" },
    { eventType: "unknown" }, { chartIds: [] }, { chartIds: ["a", "b"] },
    { bodies: [] }, { bodies: ["Sun"] }, { bodies: new Array(2) },
    { aspectAngleDegrees: null }, { aspectAngleDegrees: -1 }, { aspectAngleDegrees: 181 },
    { aspectAngleDegrees: Number.NaN }, { extra: true },
    { definition: { id: "no-version", parameters: {} } },
    { definition: { id: "definition/1", parameters: [] } },
    { definition: { id: "definition/1", parameters: { unsupported: undefined } } },
    { occurrence: { scheme: "other/1", key: "a" } },
    { occurrence: { scheme: "source-key/1", key: "" } },
    { occurrence: { scheme: "source-key/1", key: "a", extra: true } },
    { occurrence: { scheme: "utc-day-ordinal/1", startUtc: window.startUtc, ordinal: -1 } },
    { occurrence: { scheme: "utc-day-ordinal/1", startUtc: window.startUtc, ordinal: 0.5 } },
    { occurrence: { scheme: "utc-day-ordinal/1", startUtc: window.startUtc, ordinal: Number.MAX_SAFE_INTEGER + 1 } },
    { occurrence: { scheme: "utc-day-ordinal/1", startUtc: transit.receipt.utc, ordinal: 0 } }
  ])("refuses malformed identity fields: %j", (patch) => {
    expect(() => createEventIdentity({ ...identity, ...patch } as unknown as EventIdentity)).toThrow(RangeError);
  });

  it("refuses hidden, executable and lossy JSON fields instead of hashing an incomplete record", () => {
    let calls = 0;
    const accessor = Object.defineProperty({}, "value", { enumerable: true, get() { calls++; return 1; } });
    const hidden = Object.defineProperty({}, "value", { value: 1 });
    const extraArray = Object.assign([1, 2], { ignored: 3 });
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const malformed = [
      accessor, hidden, { [Symbol("key")]: true }, { value: extraArray }, { value: [undefined] },
      { value: new Array(1) }, { value: 1n }, { value: Infinity }, { value: new Date(0) },
      { value: "\ud800" }, cycle, { toJSON() { calls++; return {}; } }
    ];
    for (const parameters of malformed) {
      expect(() => eventUid({ ...identity, definition: { id: "test/1", parameters: parameters as JsonObject } })).toThrow(RangeError);
    }
    expect(calls).toBe(0);
  });
});

describe("complete canonical batch assignment", () => {
  it("distinguishes nearby passes without rounding timestamps into identity buckets", () => {
    const events = [unidentified("2026-02-03T04:05:06.499Z"), unidentified("2026-02-03T04:05:06.501Z")];
    const original = identify(events);
    expect(new Set(original.map((event) => event.uid)).size).toBe(2);
    expect(original.map((event) => event.identity!.occurrence)).toEqual([
      { scheme: "utc-day-ordinal/1", startUtc: window.startUtc, ordinal: 0 },
      { scheme: "utc-day-ordinal/1", startUtc: window.startUtc, ordinal: 1 }
    ]);
    const refined = identify([unidentified("2026-02-03T04:05:06.500Z"), unidentified("2026-02-03T04:05:06.502Z")]);
    expect(refined.map((event) => event.uid)).toEqual(original.map((event) => event.uid));
    const parsed = new ICAL.Component(ICAL.parse(serializeCalendar(original, fixtureOptions))).getAllSubcomponents("vevent");
    expect(parsed.map((event) => new ICAL.Event(event).startDate.toString())).toEqual([
      "2026-02-03T04:05:06Z", "2026-02-03T04:05:06Z"
    ]);
    expect(parsed.map((event) => event.getFirstPropertyValue("x-zodiacs-utc"))).toEqual(events.map((event) => event.receipt.utc));
  });

  it("assigns ordinals independently for each series and ignores input ordering", () => {
    const first = unidentified("2026-02-03T02:00:00.000Z");
    const second = unidentified("2026-02-03T03:00:00.000Z");
    const otherChart = { ...first, chartIds: ["synthetic-chart-b/config-1"] };
    const full = identify([second, otherChart, first]);
    expect(full).toEqual(identify([first, second, otherChart]));
    expect(full.filter((event) => event.identity!.chartIds[0] === identity.chartIds[0])).toEqual(identify([first, second]));
    expect(new Set(full.map((event) => event.uid)).size).toBe(3);
  });

  it("rejects tied instants in one series, refused searches, intervals and partial windows", () => {
    const event = unidentified();
    expect(() => identify(new Array(1))).toThrow(RangeError);
    expect(() => identify([event, event])).toThrow(/Ambiguous/);
    expect(() => identifyEventBatch(identity.namespace, { status: "refused", window, events: [] })).toThrow(/complete/);
    expect(() => identifyEventBatch(identity.namespace, { status: "complete", window: { ...window, endUtc: transit.receipt.utc }, events: [event] }))
      .toThrow(/fixed UTC day/);
    expect(() => identify([{ ...event, endUtc: window.endUtc }])).toThrow(/source occurrence key/);
    expect(() => identify([{ ...event, receipt: { ...interval.receipt, utc: event.receipt.utc }, chartIds: [] }])).toThrow(/source occurrence key/);
    expect(identify([])).toEqual([]);
  });
});

describe("identity and receipt consistency", () => {
  it("rejects UID, event type, participant and angle mismatches during serialization", () => {
    expect(() => encode({ ...transit, uid: "forged@calendar.invalid" })).toThrow(/UID/);
    expect(() => encode({ ...transit, receipt: { ...transit.receipt, eventType: "synastry-exact" } })).toThrow(/does not match/);
    expect(() => encode({ ...transit, receipt: { ...transit.receipt, bodies: ["Sun", "Moon"] } })).toThrow(/does not match/);
    expect(() => encode({ ...transit, receipt: { ...transit.receipt, aspect: { name: "trine", angleDegrees: 120 } } })).toThrow(/does not match/);
  });

  it("enforces canonical day ownership and source-key interval identities", () => {
    const event = identify([unidentified()])[0]!;
    for (const utc of [window.startUtc, "2026-02-04T00:00:00.001Z"]) {
      expect(() => encode({ ...event, receipt: { ...event.receipt, utc } })).toThrow(/outside/);
      expect(() => identify([unidentified(utc)])).toThrow(/outside/);
    }
    expect(() => encode({ ...event, receipt: { ...event.receipt, utc: window.endUtc } })).not.toThrow();
    expect(() => encode({ ...event, endUtc: window.endUtc })).toThrow(/source occurrence key/);
    expect(() => createEventIdentity({
      ...interval.identity!, occurrence: { scheme: "utc-day-ordinal/1", startUtc: window.startUtc, ordinal: 0 }
    })).toThrow(/source occurrence key/);
  });
});
