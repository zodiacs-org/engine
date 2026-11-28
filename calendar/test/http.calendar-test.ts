import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import type { IncomingHttpHeaders, Server } from "node:http";
import { once } from "node:events";
import ICAL from "ical.js";
import { afterEach, describe, expect, it } from "vitest";
import { createFeedServer, feedPath } from "../src/http.js";
import type { FeedServerLimits } from "../src/http.js";
import { configureFeed } from "../src/cli-config.js";
import { streamCalendar, streamSchedule } from "../src/stream.js";
import type { FeedConfiguration } from "../src/cli-config.js";

const example = (): FeedConfiguration => JSON.parse(readFileSync(new URL("../examples/synthetic-void.json", import.meta.url), "utf8"));
const servers: Server[] = [];
async function start(config: unknown = example(), limits: Partial<FeedServerLimits> = {}) {
  const server = createFeedServer({ synthetic: config }, limits); servers.push(server);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing server address.");
  return `http://127.0.0.1:${address.port}`;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections(); server.close(() => resolve());
  })));
});
async function get(base: string, path = feedPath("synthetic"), headers: IncomingHttpHeaders = {}, method = "GET") {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string; complete: boolean }>((resolve, reject) => {
    const request = httpRequest(base + path, { headers, method, agent: false }, response => {
      let body = "";
      response.setEncoding("utf8"); response.on("data", chunk => { body += chunk; });
      response.on("error", () => {});
      response.once("close", () => resolve({ status: response.statusCode!, headers: response.headers, body, complete: response.complete }));
    });
    request.once("error", reject); request.end();
  });
}

describe("HTTP feeds through actual isolated searches", () => {
  it("matches the committed UTC golden and preserves TZID interval receipts in independent parser round trips", async () => {
    const value = example(), { timeZone: _zone, ...utc } = value;
    const base = await start(utc);
    const feed = await get(base);
    expect(feed.status).toBe(200); expect(feed.complete).toBe(true);
    expect(feed.headers["content-type"]).toBe("text/calendar; charset=utf-8");
    expect(feed.headers["content-disposition"]).toBe('inline; filename="synthetic.ics"');
    expect(Buffer.from(feed.body)).toEqual(readFileSync(new URL("./fixtures/synthetic-void-of-course.ics", import.meta.url)));
    const localBase = await start(value), local = await get(localBase);
    expect(local.status).toBe(200); expect(local.complete).toBe(true);
    const { request, options } = configureFeed(value);
    let expected = "";
    for await (const chunk of streamCalendar(streamSchedule(request), options)) expected += chunk;
    expect(local.body).toBe(expected);
    const parsed = new ICAL.Component(ICAL.parse(local.body));
    const zone = new ICAL.Timezone(parsed.getFirstSubcomponent("vtimezone")!);
    const events = parsed.getAllSubcomponents("vevent").map(component => new ICAL.Event(component));
    const utcEvents = new ICAL.Component(ICAL.parse(feed.body)).getAllSubcomponents("vevent").map(component => new ICAL.Event(component));
    expect(events.length).toBeGreaterThan(0);
    events.forEach((event, index) => {
      event.startDate.zone = zone; event.endDate.zone = zone;
      expect(event.uid).toBe(utcEvents[index]!.uid);
      expect(JSON.parse(event.description)).toEqual(JSON.parse(utcEvents[index]!.description));
      expect(event.startDate.toJSDate()).toEqual(utcEvents[index]!.startDate.toJSDate());
      expect(event.endDate.toJSDate()).toEqual(utcEvents[index]!.endDate.toJSDate());
    });
  }, 30_000);

  it("supports weak/list/wildcard conditional GET and HEAD, without deriving Last-Modified from DTSTAMP", async () => {
    const base = await start(), first = await get(base);
    const tag = first.headers.etag!;
    expect(tag).toMatch(/^W\/"[a-f0-9]{64}"$/);
    expect(first.headers["last-modified"]).toBeUndefined();
    for (const match of [tag, tag.slice(2), `"opaque,comma", , ${tag},`, "*"]) {
      const response = await get(base, undefined, { "if-none-match": match });
      expect(response).toMatchObject({ status: 304, body: "", complete: true });
      expect(response.headers.etag).toBe(tag);
    }
    const head = await get(base, undefined, {}, "HEAD");
    expect(head).toMatchObject({ status: 200, body: "", complete: true });
    expect(head.headers.etag).toBe(tag);
    const conditionalHead = await get(base, undefined, { "if-none-match": tag }, "HEAD");
    expect(conditionalHead.status).toBe(304);
    const mismatch = await get(base, undefined, { "if-none-match": '"different"',
      "if-modified-since": "Wed, 01 Jan 2100 00:00:00 GMT" });
    expect(mismatch).toMatchObject({ status: 200, body: first.body });
    const fresh = await start();
    const freshHead = await get(fresh, undefined, {}, "HEAD");
    expect(freshHead).toMatchObject({ status: 200, body: "" });
    expect(freshHead.headers.etag).not.toBe(tag);
    expect((await get(fresh)).body).toBe(first.body);
    expect((await get(await start(), undefined, { "if-none-match": "*" })).status).toBe(304);
  }, 30_000);

  it("uses configured URLs only and refuses request methods, bodies and tuning parameters", async () => {
    const base = await start();
    expect((await get(base, "/feeds/missing.ics")).status).toBe(404);
    for (const path of ["/", "/feeds/synthetic.ics?startUtc=2000", "/feeds/%73ynthetic.ics", "/feeds/../synthetic.ics"]) {
      expect((await get(base, path)).status).toBe(400);
    }
    const post = await get(base, undefined, {}, "POST");
    expect(post.status).toBe(405); expect(post.headers.allow).toBe("GET, HEAD");
    expect((await get(base, undefined, { "content-length": "1" })).status).toBe(400);
    expect((await get(base, undefined, { "transfer-encoding": "chunked" })).status).toBe(400);
  });

  it("returns explicit errors for early search refusals, empty ranges, deadlines and output limits", async () => {
    const value = example();
    const refused = { ...value, schedule: { ...value.schedule, maxEvaluations: 1 } };
    const base = await start(refused);
    for (const headers of [{}, { "if-none-match": "*" }]) {
      const result = await get(base, undefined, headers);
      expect(result.status).toBe(422); expect(result.body).toContain("evaluation-budget");
      expect(result.headers.etag).toBeUndefined(); expect(result.headers["cache-control"]).toBe("no-store");
    }
    const empty = { ...value, schedule: { ...value.schedule,
      startUtc: "2026-02-01T00:00:00.000Z", endUtc: "2026-02-02T00:00:00.000Z",
      schedules: [{ kind: "ingress", request: { namespace: "synthetic-http.calendar.invalid", body: "Sun", clock: "utc", stepMs: 3_600_000 } }]
    } };
    const result = await get(await start(empty));
    expect(result.status).toBe(422); expect(result.body).toContain("No events");
    const timeout = await get(await start(value, { deadlineMs: 1 }));
    expect(timeout.status).toBe(504); expect(timeout.headers.etag).toBeUndefined();
    const oversize = await get(await start(value, { maxOutputBytes: 1 }));
    expect(oversize.status).toBe(413); expect(oversize.body).not.toContain("BEGIN:VCALENDAR");
  }, 30_000);

  it("interrupts a blocked worker on disconnect and keeps conditional requests responsive", async () => {
    const value = example();
    const slow = { ...value, schedule: { ...value.schedule, startUtc: "2026-02-01T00:00:00.000Z",
      endUtc: "2026-02-02T00:00:00.000Z", schedules: [{ kind: "ingress", request: {
        namespace: "synthetic-http-slow.calendar.invalid", body: "Moon", clock: "utc", stepMs: 1_000
      } }] } };
    const probe = { ...slow, schedule: { ...slow.schedule, maxEvaluations: 1 } };
    const server = createFeedServer({ synthetic: value, slow, probe }, { maxConcurrent: 1 }); servers.push(server);
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No address.");
    const base = `http://127.0.0.1:${address.port}`, ready = await get(base);
    const pending = httpRequest(base + "/feeds/slow.ics", { agent: false });
    pending.on("error", () => {}); pending.end();
    // A confirmed conditional request bypasses occupied generation capacity.
    await once(pending, "finish");
    await expect.poll(async () => (await get(base)).status).toBe(503);
    expect((await get(base, undefined, { "if-none-match": ready.headers.etag! })).status).toBe(304);
    pending.destroy();
    // An unconfirmed, quickly refused feed proves that the terminated worker
    // released its generation slot, rather than bypassing the capacity check.
    await expect.poll(async () => (await get(base, "/feeds/probe.ics")).status, { timeout: 10_000 }).toBe(422);
  }, 30_000);
});
