import { readFileSync } from "node:fs";
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { currentEngineIdentity, serializeCalendar } from "../src/index.js";
import type { JsonObject, ScheduleEvent, ScheduleReceipt } from "../src/types.js";
import { fixtureOptions, syntheticEvents } from "./fixtures/synthetic-events.js";

const transit = syntheticEvents[0]!;
const interval = syntheticEvents[1]!;
const encode = (event: ScheduleEvent) => serializeCalendar([event], fixtureOptions);
const parse = (value: string) => new ICAL.Component(ICAL.parse(value));
const asText = (value: unknown) => {
  expect(typeof value).toBe("string");
  return value as string;
};

describe("iCalendar serialization", () => {
  it("matches the hand-reviewed formatting fixture, including CRLF bytes", () => {
    const golden = readFileSync(new URL("./fixtures/synthetic-events.ics", import.meta.url));
    expect(Buffer.from(serializeCalendar(syntheticEvents, fixtureOptions))).toEqual(golden);
    expect(golden.toString("utf8")).not.toMatch(/(?<!\r)\n|\r(?!\n)/u);
    expect(golden.toString("utf8")).toMatch(/END:VCALENDAR\r\n$/u);
    for (const line of golden.toString("utf8").split("\r\n")) {
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    }
  });

  it("round-trips event times, summary and receipt JSON through ical.js", () => {
    const parsed = parse(serializeCalendar(syntheticEvents, fixtureOptions));
    expect(parsed.getFirstPropertyValue("version")).toBe("2.0");
    const components = parsed.getAllSubcomponents("vevent");
    expect(components).toHaveLength(syntheticEvents.length);
    components.forEach((component, index) => {
      const expected = syntheticEvents[index]!;
      const event = new ICAL.Event(component);
      expect(event.uid).toBe(expected.uid);
      expect(event.summary).toBe(expected.summary);
      expect(event.startDate.toJSDate().toISOString()).toBe(expected.receipt.utc.replace(/\.\d{3}Z$/u, ".000Z"));
      expect(JSON.parse(event.description)).toEqual(expected.receipt);
      expect(component.getFirstPropertyValue("transp")).toBe("TRANSPARENT");
      expect(component.getFirstPropertyValue("x-zodiacs-schema")).toBe(expected.receipt.schema);
      expect(component.getFirstPropertyValue("x-zodiacs-utc")).toBe(expected.receipt.utc);
      expect(component.getFirstPropertyValue("x-zodiacs-event-type")).toBe(expected.receipt.eventType);
      expect(JSON.parse(asText(component.getFirstPropertyValue("x-zodiacs-bodies")))).toEqual(expected.receipt.bodies);
      expect(JSON.parse(asText(component.getFirstPropertyValue("x-zodiacs-aspect")))).toEqual(expected.receipt.aspect);
      expect(JSON.parse(asText(component.getFirstPropertyValue("x-zodiacs-orb-degrees")))).toBe(expected.receipt.orbDegrees);
      expect(component.getFirstPropertyValue("x-zodiacs-engine")).toBe("@zodiacs/engine@1.0.0");
      expect(component.getFirstPropertyValue("x-zodiacs-ephemeris")).toBe("astronomy-engine@2.1.19");
      if (expected.endUtc === undefined) {
        expect(component.hasProperty("dtend")).toBe(false);
        expect(component.hasProperty("x-zodiacs-end-utc")).toBe(false);
        expect(event.duration.toSeconds()).toBe(0);
      } else {
        expect(event.endDate.toJSDate().toISOString()).toBe("2026-02-04T06:30:00.000Z");
        expect(event.duration.toSeconds()).toBe(4 * 3600 + 15 * 60);
        expect(component.getFirstPropertyValue("x-zodiacs-end-utc")).toBe(expected.endUtc);
      }
    });
  });

  it("preserves Unicode, punctuation and embedded newlines without injecting components", () => {
    const text = "月🌙; café, \\ literal\\n\r\nBEGIN:VEVENT\rEND:VCALENDAR\nline:two";
    const event = { ...transit, summary: text, receipt: { ...transit.receipt, source: { text } } };
    const parsed = parse(encode(event));
    expect(parsed.getAllSubcomponents()).toHaveLength(1);
    const result = new ICAL.Event(parsed.getFirstSubcomponent("vevent")!);
    expect(result.summary).toBe(text.replace(/\r\n|\r/gu, "\n"));
    expect(JSON.parse(result.description).source).toEqual({ text });
  });

  it("serializes equivalent source objects deterministically without reading the clock", () => {
    const sourceA = { z: [3, { b: true, a: null }], a: 1 };
    const sourceB = { a: 1, z: [3, { a: null, b: true }] };
    expect(encode({ ...transit, receipt: { ...transit.receipt, source: sourceA } }))
      .toBe(encode({ ...transit, receipt: { ...transit.receipt, source: sourceB } }));
    expect(encode(transit)).toBe(encode(transit));
  });

  it("accepts a one-shot iterable in its supplied event order", () => {
    function* events() { yield* syntheticEvents; }
    expect(serializeCalendar(events(), fixtureOptions)).toBe(serializeCalendar(syntheticEvents, fixtureOptions));
  });

  it("rejects a duplicate UID or a calendar with no component", () => {
    expect(() => serializeCalendar([transit, transit], fixtureOptions)).toThrow(RangeError);
    expect(() => serializeCalendar([], fixtureOptions)).toThrow(RangeError);
  });

  it.each(["", " leading", "trailing ", "foo\nBEGIN:VEVENT", "a\u0000b", "\ud800"])(
    "rejects malformed UIDs: %j", (uid) => expect(() => encode({ ...transit, uid })).toThrow(RangeError)
  );

  it.each(["2026-02-04T02:14:59.999Z", "2026-02-04T02:15:00.123Z", "2026-02-04T02:15:00.999Z"])(
    "rejects an end that does not follow the start at second resolution: %s",
    (endUtc) => expect(() => encode({ ...interval, endUtc })).toThrow(RangeError)
  );

  it("validates revision, start and end instants before serialization", () => {
    expect(() => serializeCalendar([transit], { dtstamp: "invalid" })).toThrow(RangeError);
    expect(() => encode({ ...transit, receipt: { ...transit.receipt, utc: "2026-02-30T00:00:00.000Z" } })).toThrow(RangeError);
    expect(() => encode({ ...interval, endUtc: "2026-02-30T00:00:00.000Z" })).toThrow(RangeError);
  });
});

describe("receipt validation", () => {
  it.each([
    { schema: "other/1" }, { eventType: "other" }, { bodies: [] }, { bodies: [" Moon"] },
    { bodies: ["Moon", undefined] }, { bodies: new Array(2) },
    { aspect: null }, { aspect: { name: "", angleDegrees: 90 } },
    { aspect: { name: "square", angleDegrees: 181 } },
    { aspect: { name: "square", angleDegrees: Number.NaN } },
    { orbDegrees: null }, { orbDegrees: -1 }, { orbDegrees: Number.POSITIVE_INFINITY },
    { bodies: ["Moon"] },
    { engine: { ...transit.receipt.engine, name: "other" } },
    { engine: { ...transit.receipt.engine, version: "" } },
    { engine: { ...transit.receipt.engine, ephemeris: { name: "other", version: "1" } } }
  ])("refuses malformed receipt fields %j", (patch) => {
    const receipt = { ...transit.receipt, ...patch } as unknown as ScheduleReceipt;
    expect(() => encode({ ...transit, receipt })).toThrow(RangeError);
  });

  it.each(["ingress", "station", "eclipse", "void-of-course"] as const)(
    "retains explicit null aspect and orb for %s", (eventType) => {
      const receipt = { ...interval.receipt, eventType };
      const component = parse(encode({ ...interval, receipt })).getFirstSubcomponent("vevent")!;
      expect(JSON.parse(asText(component.getFirstPropertyValue("description")))).toEqual(receipt);
    }
  );

  it("requires an aspect, angular orb and two bodies for synastry exacts", () => {
    const receipt = { ...transit.receipt, eventType: "synastry-exact" as const };
    expect(() => encode({ ...transit, receipt })).not.toThrow();
    expect(() => encode({ ...transit, receipt: { ...receipt, aspect: null } })).toThrow(RangeError);
    expect(() => encode({ ...transit, receipt: { ...receipt, orbDegrees: null } })).toThrow(RangeError);
    expect(() => encode({ ...transit, receipt: { ...receipt, bodies: ["Moon"] } })).toThrow(RangeError);
  });

  it.each([null, [], "text", { value: undefined }, { value: Number.NaN }, { value: 1n },
    { value: new Date() }, { value: new Array(1) }, { value: "\ud800" }])(
    "rejects a source that cannot be preserved as plain JSON (case %#)", (source) => {
      const receipt = { ...transit.receipt, source: source as unknown as JsonObject };
      expect(() => encode({ ...transit, receipt })).toThrow(RangeError);
    }
  );

  it("projects declared aspect fields consistently in DESCRIPTION and X properties", () => {
    const aspect = { name: "square", angleDegrees: 90, ignored: () => "extra metadata" };
    const component = parse(encode({ ...transit, receipt: { ...transit.receipt, aspect } }))
      .getFirstSubcomponent("vevent")!;
    const descriptionAspect = JSON.parse(asText(component.getFirstPropertyValue("description"))).aspect;
    const propertyAspect = JSON.parse(asText(component.getFirstPropertyValue("x-zodiacs-aspect")));
    expect(descriptionAspect).toEqual({ name: "square", angleDegrees: 90 });
    expect(propertyAspect).toEqual(descriptionAspect);
  });

  it("rejects cyclic JSON but permits shared acyclic references", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => encode({ ...transit, receipt: { ...transit.receipt, source: cycle as JsonObject } })).toThrow(RangeError);
    const shared = { text: "synthetic" };
    const source = { a: shared, b: shared };
    const component = parse(encode({ ...transit, receipt: { ...transit.receipt, source } })).getFirstSubcomponent("vevent")!;
    expect(JSON.parse(asText(component.getFirstPropertyValue("description"))).source).toEqual(source);
  });
});

describe("relative engine integration", () => {
  it("reads the checkout's engine identity without relabeling supplied receipts", () => {
    expect(currentEngineIdentity()).toEqual({ name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: EPHEMERIS });
    expect(currentEngineIdentity().ephemeris).not.toBe(EPHEMERIS);
    const receipt = { ...transit.receipt, engine: { ...transit.receipt.engine, version: "0.1.1-rc.16" } };
    const component = parse(encode({ ...transit, receipt })).getFirstSubcomponent("vevent")!;
    expect(JSON.parse(asText(component.getFirstPropertyValue("description"))).engine.version).toBe("0.1.1-rc.16");
  });
});
