import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeocoder } from "../src/geocoder.js";
import type { Geocoder } from "../src/geocoder.js";
import { createGeocodeServer, HTTP_LIMITS } from "../src/http-server.js";
import type { GeocodeHttpServer, HttpServerOptions } from "../src/http-server.js";
import type { PlaceDataset, PlaceRecord } from "../src/types.js";

// Invented places, queries and civil readings, unrelated to any person's birth.
function place(id: string, overrides: Partial<PlaceRecord> = {}): PlaceRecord {
  return {
    id: `synthetic:${id}`, name: "Amber Harbour", asciiName: "Amber Harbour", aliases: ["Port of Amber"],
    countryCode: "ZZ", countryName: "Example Republic", regionCode: "01", regionName: "North Reach",
    latitude: 12.3456789, longitude: -45.6789123, elevationMeters: null, demElevationMeters: 17,
    population: null, timeZone: "Etc/UTC", ...overrides
  };
}

const dataset: PlaceDataset = {
  schemaVersion: 1,
  provenance: { dataset: "synthetic", license: "MIT", attribution: "Invented HTTP test records", sources: [] },
  places: [place("one"), place("two", { regionCode: "02" }),
    place("missing", { name: "No Zone", asciiName: "No Zone", aliases: [], timeZone: null }),
    place("dst", { name: "Clock Town", asciiName: "Clock Town", aliases: [], timeZone: "America/New_York" })]
};
const geocoder = createGeocoder(dataset, { resolve: () => { throw new Error("Unexpected atlas call"); } });
const services: GeocodeHttpServer[] = [];

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
  vi.restoreAllMocks();
});

async function start(provider: Geocoder = geocoder) {
  const service = createGeocodeServer(provider);
  services.push(service);
  const address = await service.start();
  expect(address.address).toBe("127.0.0.1");
  expect(address.port).toBeGreaterThan(0);
  return { service, port: address.port };
}

type Response = { status: number; headers: Record<string, unknown>; text: string; body: any };
function request(port: number, path: string, method = "GET", body?: string | Buffer,
  headers: Record<string, string> = {}, chunked = false): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method, agent: false, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        try { resolve({ status: res.statusCode!, headers: res.headers, text, body: JSON.parse(text) }); }
        catch (error) { reject(error); }
      });
    });
    req.setTimeout(5000, () => { req.destroy(new Error("Test client timed out")); });
    req.on("error", reject);
    if (chunked && body !== undefined) { req.write(body); req.end(); }
    else req.end(body);
  });
}

const civil = { placeId: "synthetic:one", date: "2001-06-15", time: "08:30" };
const jsonHeaders = { "Content-Type": "application/json" };
const tz = (port: number, value: unknown) => request(port, "/tz", "POST", JSON.stringify(value), jsonHeaders);

describe("HTTP routes preserve library outcomes", () => {
  it("returns filtered Unicode lookup, source fields and provenance without provider access", async () => {
    const { port } = await start();
    const response = await request(port, "/lookup?query=%EF%BC%A1mber&country=ZZ&region=01&limit=1");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...geocoder.lookup("Ａmber", { country: "ZZ", region: "01", limit: 1 }), provenance: geocoder.provenance });
    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers).not.toHaveProperty("access-control-allow-origin");
  });

  it("preserves ambiguity through truncation and allows a separate explicit selection", async () => {
    const { port } = await start();
    const lookup = await request(port, "/lookup?query=Amber&limit=1");
    expect(lookup.body).toMatchObject({ status: "ambiguous", total: 2, truncated: true });
    expect(lookup.body.candidates).toHaveLength(1);
    expect((await tz(port, { query: "Amber", filters: { limit: 1 }, date: civil.date, time: civil.time })).body)
      .toMatchObject({ status: "ambiguous-place", place: null, time: null });
    const chosen = await tz(port, { ...civil, placeId: "synthetic:two" });
    expect(chosen.status).toBe(200);
    expect(chosen.body).toEqual(JSON.parse(JSON.stringify(await geocoder.resolve({ ...civil, placeId: "synthetic:two" }))));
    expect(chosen.body.time.resolution.utc).toBe("2001-06-15T08:30:00.000Z");
  });

  it("keeps date-only, absent places and unavailable zones as normal structured outcomes", async () => {
    const { port } = await start();
    for (const input of [
      { query: "Port of Amber", filters: { region: "01" }, date: civil.date },
      { placeId: "synthetic:absent", date: civil.date },
      { query: "Absent City", date: civil.date },
      { ...civil, placeId: "synthetic:missing" }
    ]) {
      const response = await tz(port, input);
      expect(response.status).toBe(200);
      expect(response.body).toEqual(JSON.parse(JSON.stringify(await geocoder.resolve(input))));
    }
    const spy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("PRIVATE provider details"); });
    expect((await tz(port, { placeId: "synthetic:one", date: civil.date })).body)
      .toMatchObject({ status: "date-only", time: null });
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([ ["2020-03-08", "02:30", "nonexistent"], ["2020-11-01", "01:30", "ambiguous"] ])(
    "returns the existing IANA policy for %s %s", async (date, time, status) => {
      const { port } = await start();
      const input = { placeId: "synthetic:dst", date: date!, time: time! };
      const response = await tz(port, input);
      expect(response.status).toBe(200);
      expect(response.body.time).toMatchObject({ provider: "iana", status });
      expect(response.body).toEqual(JSON.parse(JSON.stringify(await geocoder.resolve(input))));
    }
  );

  it("reports provider RangeErrors as operational failures without echoing input", async () => {
    const provider = { ...geocoder, resolve: vi.fn(async () => { throw new RangeError("PRIVATE provider details"); }) };
    const { port } = await start(provider);
    const response = await tz(port, civil);
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("resolution-error");
    expect(response.text).not.toContain("PRIVATE");
    expect(response.text).not.toContain(civil.date);
    expect(response.text).not.toContain(civil.placeId);
  });
});

describe("bounded and validated HTTP inputs", () => {
  it.each([
    "/lookup", "/lookup?query=Amber&query=PRIVATE", "/lookup?query=Amber&country=ZZ&country=ZZ",
    "/lookup?query=Amber&limit=0", "/lookup?query=Amber&limit=101", "/lookup?query=Amber&limit=1e1",
    "/lookup?query=Amber&region=", "/lookup?query=Amber&unknown=PRIVATE",
    "/lookup?query=%FF", "/lookup?query=%ZZ", "/lookup?query=Amber%00",
    `/lookup?query=${"x".repeat(513)}`, "/lookup?query=PRIVATE#fragment",
    "//PRIVATE/lookup?query=Amber", "http://PRIVATE/lookup?query=Amber"
  ])("refuses malformed lookup target %s", async (path) => {
    const { port } = await start();
    const response = await request(port, path);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid-input");
    expect(response.text).not.toContain("PRIVATE");
  });

  it.each([
    null, [], {}, { query: "PRIVATE" }, { ...civil, query: "PRIVATE" },
    { ...civil, filters: {} }, { ...civil, date: "2000-02-30" }, { ...civil, time: "24:00" },
    { ...civil, time: null }, { ...civil, timeZone: "Etc/UTC" },
    { query: "PRIVATE", filters: null, date: civil.date },
    { query: "PRIVATE", filters: { limit: "1" }, date: civil.date },
    { query: "PRIVATE", filters: { __proto__: null, country: "ZZ", unknown: true }, date: civil.date },
    { placeId: null, date: civil.date }, { placeId: "", date: civil.date },
    { query: "PRIVATE", date: civil.date, calendar: "julian" }
  ])("rejects malformed timezone request %# before providers", async (input) => {
    const resolve = vi.fn(geocoder.resolve);
    const { port } = await start({ ...geocoder, resolve });
    const response = await tz(port, input);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid-input");
    expect(response.text).not.toContain("PRIVATE");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("refuses route confusion, wrong methods, GET bodies and timezone query parameters", async () => {
    const { port } = await start();
    for (const path of ["/", "/PRIVATE", "/lookup/", "/%6cookup", "/tz/../lookup"]) {
      const response = await request(port, path);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("not-found");
    }
    for (const [path, method, allow] of [["/lookup", "POST", "GET"], ["/tz", "GET", "POST"], ["/tz", "OPTIONS", "POST"]]) {
      const response = await request(port, path!, method!);
      expect(response.status).toBe(405);
      expect(response.headers.allow).toBe(allow);
    }
    expect((await request(port, "/lookup?query=Amber", "GET", "PRIVATE", { "Content-Length": "7" })).status).toBe(400);
    expect((await request(port, "/tz?query=PRIVATE", "POST", JSON.stringify(civil), jsonHeaders)).status).toBe(400);
  });

  it.each([{}, { "Content-Type": "text/plain" }, { "Content-Type": "application/json; charset=latin1" },
    { ...jsonHeaders, "Content-Encoding": "gzip" }])("requires uncompressed UTF-8 JSON %#", async (headers) => {
    const { port } = await start();
    const response = await request(port, "/tz", "POST", JSON.stringify(civil), headers);
    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe("unsupported-media-type");
  });

  it.each(["", "{PRIVATE", "null", "[]", "{\"__proto__\":{},\"date\":\"2001-01-01\"}", Buffer.from([0xff])])(
    "refuses malformed JSON or UTF-8 %#", async (body) => {
      const { port } = await start();
      const response = await request(port, "/tz", "POST", body, jsonHeaders);
      expect(response.status).toBe(400);
      expect(response.text).not.toContain("PRIVATE");
    }
  );

  it("enforces URL and body byte limits including chunked transfer", async () => {
    const { port } = await start();
    const url = `/lookup?query=Amber&pad=${"x".repeat(HTTP_LIMITS.urlBytes)}`;
    expect((await request(port, url.slice(0, HTTP_LIMITS.urlBytes))).status).toBe(400);
    const tooLong = await request(port, url.slice(0, HTTP_LIMITS.urlBytes + 1));
    expect(tooLong.status).toBe(414);
    expect(tooLong.body.error.code).toBe("url-too-large");
    const json = JSON.stringify(civil);
    const boundary = json.padEnd(HTTP_LIMITS.bodyBytes, " ");
    for (const chunked of [false, true]) {
      expect((await request(port, "/tz", "POST", boundary, jsonHeaders, chunked)).status).toBe(200);
      const overflow = await request(port, "/tz", "POST", `${boundary} `, jsonHeaders, chunked);
      expect(overflow.status).toBe(413);
      expect(overflow.body.error.code).toBe("body-too-large");
      expect(overflow.headers.connection).toBe("close");
    }
    expect((await tz(port, civil)).status).toBe(200);
  });

  it("bounds headers and gives structured parser errors without request contents", async () => {
    const { port } = await start();
    const overflow = await request(port, "/lookup?query=Amber", "GET", undefined, { "X-Private": "x".repeat(HTTP_LIMITS.headerBytes) });
    expect(overflow.status).toBe(431);
    expect(overflow.body.error.code).toBe("invalid-http");
    const raw = await new Promise<string>((resolve, reject) => {
      const socket = connect(port, "127.0.0.1", () => socket.write("PRIVATE INVALID HTTP\r\n\r\n"));
      let bytes = "";
      socket.on("data", (chunk) => { bytes += chunk.toString(); });
      socket.on("error", reject);
      socket.on("end", () => resolve(bytes));
    });
    expect(raw).toContain("HTTP/1.1 400");
    expect(raw).not.toContain("PRIVATE");
    expect(JSON.parse(raw.split("\r\n\r\n")[1]!)).toHaveProperty("error.code", "invalid-http");
  });

  it("survives an aborted JSON stream and continues serving other clients", async () => {
    const { port } = await start();
    await new Promise<void>((resolve, reject) => {
      const socket = connect(port, "127.0.0.1", () => {
        socket.write("POST /tz HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{", () => socket.destroy());
      });
      socket.on("error", reject);
      socket.on("close", () => resolve());
    });
    expect((await tz(port, civil)).status).toBe(200);
  });
});

describe("explicit HTTP lifecycle", () => {
  it("does not listen at construction, starts once, closes idempotently and refuses restart", async () => {
    const provider = { ...geocoder, resolve: vi.fn(geocoder.resolve), lookup: vi.fn(geocoder.lookup) };
    const service = createGeocodeServer(provider);
    services.push(service);
    expect(provider.lookup).not.toHaveBeenCalled();
    expect(provider.resolve).not.toHaveBeenCalled();
    const pending = service.start();
    await expect(service.start()).rejects.toThrow("only be started once");
    const { port } = await pending;
    expect((await request(port, "/lookup?query=Amber")).status).toBe(200);
    const closing = service.close();
    expect(service.close()).toBe(closing);
    await closing;
    await expect(request(port, "/lookup?query=Amber")).rejects.toThrow();
    await expect(service.start()).rejects.toThrow("only be started once");
  });

  it("can close before start or during startup without leaking the listening socket", async () => {
    const unused = createGeocodeServer(geocoder);
    await unused.close();
    await expect(unused.start()).rejects.toThrow();
    const service = createGeocodeServer(geocoder);
    const opening = service.start();
    const closing = service.close();
    const { port } = await opening;
    await closing;
    await expect(request(port, "/lookup?query=Amber")).rejects.toThrow();
  });

  it("rejects a busy port and closes after failed startup", async () => {
    const { port } = await start();
    const other = createGeocodeServer(geocoder, { port });
    services.push(other);
    await expect(other.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
    await other.close();
  });

  it("drains an active request on shutdown", async () => {
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { port, service } = await start({ ...geocoder, async resolve(input) {
      entered(); await gate; return geocoder.resolve(input);
    } });
    const response = tz(port, civil);
    await waiting;
    const closing = service.close();
    release();
    expect((await response).status).toBe(200);
    await closing;
  });

  it("bounds shutdown when a provider remains pending", async () => {
    let entered!: () => void;
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { port, service } = await start({ ...geocoder, async resolve(input) {
      entered(); await gate; return geocoder.resolve(input);
    } });
    const response = tz(port, civil).catch((error: unknown) => error);
    await waiting;
    await service.close();
    expect(await response).toBeInstanceOf(Error);
    release();
  });

  it.each([null, [], { port: -1 }, { port: 65536 }, { port: 1.5 }, { port: "0" }, { port: undefined },
    { host: "" }, { host: " PRIVATE " }, { host: "PRIVATE\n" }, { host: undefined }, { unknown: true }])(
    "refuses malformed listener options %#", (options) => {
      expect(() => createGeocodeServer(geocoder, options as HttpServerOptions)).toThrow(RangeError);
    }
  );
});
