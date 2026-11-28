import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import ICAL from "ical.js";
import { expect, it } from "vitest";
import { configureFeed } from "../src/cli-config.js";
import { compareScheduleEvents, serializeCalendar, streamCalendar, streamSchedule } from "../src/index.js";
import type { ScheduleEvent } from "../src/index.js";

const example = JSON.parse(readFileSync(new URL("../examples/synthetic-complete.json", import.meta.url), "utf8"));
const goldenUrl = new URL("./fixtures/synthetic-complete.ics", import.meta.url);

async function wire(events: AsyncIterable<ScheduleEvent>, options: Parameters<typeof streamCalendar>[1]) {
  let text = "";
  for await (const chunk of streamCalendar(events, options)) text += chunk;
  return text;
}

function roundTrip(text: string, expected: readonly ScheduleEvent[]) {
  expect(text).not.toMatch(/(?<!\r)\n|\r(?!\n)/u);
  for (const line of text.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  const parsed = new ICAL.Component(ICAL.parse(text));
  const zoneComponent = parsed.getFirstSubcomponent("vtimezone");
  const zone = zoneComponent ? new ICAL.Timezone(zoneComponent) : undefined;
  const components = parsed.getAllSubcomponents("vevent");
  expect(components).toHaveLength(expected.length);
  expect(new Set(components.map(component => component.getFirstPropertyValue("uid"))).size).toBe(expected.length);
  components.forEach((component, index) => {
    const record = expected[index]!;
    const receipt = record.receipt;
    const event = new ICAL.Event(component);
    if (zone && component.getFirstProperty("dtstart")!.getParameter("tzid")) event.startDate.zone = zone;
    if (zone && component.getFirstProperty("dtend")?.getParameter("tzid")) event.endDate.zone = zone;
    expect(event.uid).toBe(record.uid);
    expect(event.summary).toBe(record.summary);
    expect(event.startDate.toUnixTime()).toBe(Math.floor(Date.parse(receipt.utc) / 1000));
    expect(JSON.parse(event.description)).toEqual(receipt);
    expect(component.getFirstPropertyValue("x-zodiacs-schema")).toBe(receipt.schema);
    expect(component.getFirstPropertyValue("x-zodiacs-utc")).toBe(receipt.utc);
    expect(component.getFirstPropertyValue("x-zodiacs-event-type")).toBe(receipt.eventType);
    expect(JSON.parse(component.getFirstPropertyValue("x-zodiacs-bodies") as string)).toEqual(receipt.bodies);
    expect(JSON.parse(component.getFirstPropertyValue("x-zodiacs-aspect") as string)).toEqual(receipt.aspect);
    expect(JSON.parse(component.getFirstPropertyValue("x-zodiacs-orb-degrees") as string)).toBe(receipt.orbDegrees);
    expect(component.getFirstPropertyValue("x-zodiacs-engine")).toBe(`${receipt.engine.name}@${receipt.engine.version}`);
    expect(component.getFirstPropertyValue("x-zodiacs-ephemeris"))
      .toBe(`${receipt.engine.ephemeris.name}@${receipt.engine.ephemeris.version}`);
    expect(JSON.parse(component.getFirstPropertyValue("x-zodiacs-identity") as string)).toEqual(record.identity);
    if (record.endUtc) {
      expect(event.endDate.toUnixTime()).toBe(Math.floor(Date.parse(record.endUtc) / 1000));
      expect(component.getFirstPropertyValue("x-zodiacs-end-utc")).toBe(record.endUtc);
    } else expect(component.getFirstProperty("dtend")).toBeNull();
  });
  // Parse the parser's reserialization as well, including unfolded JSON TEXT.
  const reparsed = new ICAL.Component(ICAL.parse(parsed.toString()));
  expect(reparsed.getAllSubcomponents("vevent").map(component => JSON.parse(new ICAL.Event(component).description)))
    .toEqual(expected.map(event => event.receipt));
}

it("exports every event kind together with golden UTC bytes and lossless UTC/TZID receipts", async () => {
  const { request, options } = configureFeed(example, { utc: true });
  const expected: ScheduleEvent[] = [];
  for await (const event of streamSchedule(request)) expected.push(event);
  expect(new Set(expected.map(event => event.receipt.eventType)))
    .toEqual(new Set(["ingress", "natal-transit", "synastry-exact", "station", "eclipse", "void-of-course"]));
  expect(expected).toEqual([...expected].sort(compareScheduleEvents));
  const golden = readFileSync(goldenUrl);
  expect(golden.length).toBeLessThan(2_000_000);
  expect(Buffer.from(serializeCalendar(expected, options))).toEqual(golden);
  roundTrip(golden.toString("utf8"), expected);
  for (const windowDays of [1, 31]) {
    // One-day void searches repeat more halo work. Budget is outside identity;
    // compare successful scans rather than silently increasing the CLI example.
    const output = await wire(streamSchedule({ ...request, windowDays, maxEvaluations: 2_000_000,
      schedules: [...request.schedules].reverse() }), options);
    expect(Buffer.from(output)).toEqual(golden);
  }
  const projected = configureFeed(example).options;
  const output = await wire(streamSchedule(request), projected);
  expect(output).toContain("DTSTART;TZID=America/New_York:");
  roundTrip(output, expected);
}, 120_000);

it("the complete synthetic usage example produces the golden through the actual CLI", async () => {
  const child = spawn(process.execPath, [new URL("../scripts/calendar.mjs", import.meta.url).pathname,
    "--config", new URL("../examples/synthetic-complete.json", import.meta.url).pathname, "--utc"],
  { stdio: ["ignore", "pipe", "pipe"] });
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  child.stdout.on("data", chunk => stdout.push(chunk));
  child.stderr.on("data", chunk => stderr.push(chunk));
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject); child.once("close", resolve);
  });
  expect(code).toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout)).toEqual(readFileSync(goldenUrl));
}, 30_000);
