import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import ICAL from "ical.js";
import { canonicalJson } from "../../src/canonical-json.js";
import { compareScheduleEvents, streamCalendar, streamSchedule } from "../../src/stream.js";
import type { ScheduleStreamRequest, ScheduleStreamSummary } from "../../src/stream.js";
import type { JsonValue, ScheduleEvent } from "../../src/types.js";

// Synthetic schedule and sampling settings, not physical completeness evidence.
export const longRangeRequest: ScheduleStreamRequest = {
  startUtc: "2020-01-01T00:00:00.000Z", endUtc: "2030-01-01T00:00:00.000Z",
  maxEvaluations: 1_000_000, windowDays: 7, maxBufferedEvents: 8,
  schedules: [
    { kind: "ingress", request: { namespace: "synthetic-evidence.calendar.invalid", clock: "utc", body: "Sun", stepMs: 21_600_000 } },
    { kind: "station", request: { namespace: "synthetic-evidence.calendar.invalid", clock: "utc", body: "Mercury", stepMs: 21_600_000 } }
  ]
};
export const longRangeOptions = { dtstamp: "2020-01-01T00:00:00.000Z" };

/** Digest each pulled record and wire chunk without holding a range-wide list/feed. */
export async function measureLongRange(windowDays: number) {
  const iterator = streamSchedule({ ...longRangeRequest, windowDays });
  const records = createHash("sha256"), wire = createHash("sha256");
  let summary: ScheduleStreamSummary | undefined;
  let previous: ScheduleEvent | undefined;
  let current: ScheduleEvent | undefined;
  let parsedEvents = 0, wireBytes = 0, largestChunkBytes = 0;
  const types: Record<string, number> = {};
  async function* observed() {
    try {
      while (true) {
        const next = await iterator.next();
        if (next.done) { summary = next.value; return; }
        const event = next.value;
        if (previous) assert(compareScheduleEvents(previous, event) < 0, "Unordered event.");
        assert(event.receipt.utc > longRangeRequest.startUtc && event.receipt.utc <= longRangeRequest.endUtc);
        records.update(canonicalJson(event as unknown as JsonValue) + "\n");
        types[event.receipt.eventType] = (types[event.receipt.eventType] ?? 0) + 1;
        previous = current = event;
        yield event;
      }
    } finally { await iterator.return({ status: "complete", evaluations: 0, emitted: 0, windows: 0 }); }
  }
  for await (const chunk of streamCalendar(observed(), longRangeOptions)) {
    assert(!/(?<!\r)\n|\r(?!\n)/u.test(chunk), "Invalid wire endings.");
    for (const line of chunk.split("\r\n")) assert(Buffer.byteLength(line) <= 75);
    const bytes = Buffer.byteLength(chunk);
    largestChunkBytes = Math.max(largestChunkBytes, bytes);
    wireBytes += bytes; wire.update(chunk);
    if (chunk.startsWith("BEGIN:VEVENT\r\n")) {
      const parsed = new ICAL.Component(ICAL.parse("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" + chunk + "END:VCALENDAR\r\n"));
      const event = new ICAL.Event(parsed.getFirstSubcomponent("vevent")!);
      assert.equal(event.uid, current!.uid);
      assert.deepEqual(JSON.parse(event.description), current!.receipt);
      assert.equal(event.startDate.toUnixTime(), Math.floor(Date.parse(current!.receipt.utc) / 1000));
      parsedEvents++;
    } else if (chunk === "END:VCALENDAR\r\n") assert(summary, "Footer before search completion.");
  }
  assert(summary && summary.status === "complete" && summary.emitted === parsedEvents);
  assert(summary.evaluations <= longRangeRequest.maxEvaluations);
  return { windowDays, ...summary, types, parsedEvents, wireBytes, largestChunkBytes,
    recordSha256: records.digest("hex"), wireSha256: wire.digest("hex") };
}
