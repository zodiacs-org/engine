import { describe, expect, it, vi } from "vitest";

import { createGeoNamesClient } from "../geo.js";

const indexData = {
  version: 1,
  source: "Synthetic GeoNames retry fixture",
  count: 2,
  tz: ["UTC"],
  admin1: ["Test region"],
  countries: ["Test country"],
  shards: ["n", "s"]
};
const rows = {
  n: [["New Test City", 0, 0, 0, 1000, 2000, 0, 100]],
  s: [["South Test City", 0, 0, 0, 3000, 4000, 0, 200]]
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value));
}

const failureKinds = ["network", "http", "json", "abort"] as const;
type FailureKind = (typeof failureKinds)[number];

function failRequest(kind: FailureKind, pending: ReturnType<typeof deferred<Response>>) {
  switch (kind) {
    case "network":
      pending.reject(new TypeError("Synthetic network failure"));
      break;
    case "http":
      pending.resolve(new Response("Service unavailable", { status: 503 }));
      break;
    case "json":
      pending.resolve(new Response("{invalid json"));
      break;
    case "abort": {
      // A caller-supplied fetch may be bound to its own AbortSignal. The
      // GeoNames client has no signal option and must preserve that rejection.
      const controller = new AbortController();
      controller.signal.addEventListener("abort", () => pending.reject(controller.signal.reason), {
        once: true
      });
      controller.abort(new DOMException("Synthetic request aborted", "AbortError"));
      break;
    }
  }
}

function expectSharedFailure(results: PromiseSettledResult<unknown>[], kind: FailureKind) {
  expect(results.every((result) => result.status === "rejected")).toBe(true);
  const failures = results as PromiseRejectedResult[];
  const first = failures[0]!.reason as Error;
  for (const failure of failures) expect(failure.reason).toBe(first);
  expect(first.name).toBe(
    kind === "network"
      ? "TypeError"
      : kind === "json"
        ? "SyntaxError"
        : kind === "abort"
          ? "AbortError"
          : "Error"
  );
  if (kind === "http") expect(first.message).toBe("GeoNames fetch failed: 503");
}

function requestCount(fetcher: ReturnType<typeof vi.fn>, file: string): number {
  return fetcher.mock.calls.filter(([url]) => String(url).endsWith(`/${file}`)).length;
}

describe("GeoNames failed-request retry", () => {
  it.each(failureKinds)(
    "retries an index after %s failure without an automatic request loop",
    async (kind) => {
      const pending = deferred<Response>();
      let indexRequests = 0;
      const fetcher = vi.fn(async (input: string | URL | Request) => {
        if (String(input).endsWith("/index.json")) {
          indexRequests += 1;
          return indexRequests === 1 ? pending.promise : json(indexData);
        }
        return json(rows.n);
      });
      const client = createGeoNamesClient({
        baseUrl: "https://example.test/cities",
        fetch: fetcher
      });
      const failed = Promise.allSettled([
        client.preload(),
        client.searchCities("new"),
        client.preload()
      ]);
      expect(fetcher).toHaveBeenCalledTimes(1);
      failRequest(kind, pending);
      expectSharedFailure(await failed, kind);
      expect(fetcher).toHaveBeenCalledTimes(1);

      const [metadata, cities, sameMetadata] = await Promise.all([
        client.preload(),
        client.searchCities("new"),
        client.preload()
      ]);
      expect(metadata).toMatchObject({ count: 2, shards: ["n", "s"] });
      expect(sameMetadata).toEqual(metadata);
      expect(cities).toMatchObject([
        { name: "New Test City", latitude: 10, longitude: 20, timeZone: "UTC" }
      ]);
      await client.searchCities("new");
      await client.preload();
      expect(requestCount(fetcher, "index.json")).toBe(2);
      expect(requestCount(fetcher, "n.json")).toBe(1);
    }
  );

  it.each(failureKinds)(
    "retries a shard after %s failure while retaining other successful caches",
    async (kind) => {
      const pending = deferred<Response>();
      const started = deferred<void>();
      let northRequests = 0;
      const fetcher = vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/index.json")) return json(indexData);
        if (url.endsWith("/s.json")) return json(rows.s);
        northRequests += 1;
        if (northRequests === 1) {
          started.resolve();
          return pending.promise;
        }
        return json(rows.n);
      });
      const client = createGeoNamesClient({
        baseUrl: "https://example.test/cities/",
        fetch: fetcher
      });
      expect(await client.searchCities("south")).toMatchObject([{ name: "South Test City" }]);
      const failed = Promise.allSettled([client.searchCities("new"), client.searchCities("new t")]);
      await started.promise;
      expect(requestCount(fetcher, "n.json")).toBe(1);
      failRequest(kind, pending);
      expectSharedFailure(await failed, kind);
      expect(fetcher).toHaveBeenCalledTimes(3);

      const [north, alsoNorth, south] = await Promise.all([
        client.searchCities("new"),
        client.searchCities("new t"),
        client.searchCities("south")
      ]);
      expect(north).toMatchObject([{ name: "New Test City" }]);
      expect(alsoNorth).toEqual(north);
      expect(south).toMatchObject([{ name: "South Test City" }]);
      await client.preload();
      await client.searchCities("new");
      expect(requestCount(fetcher, "index.json")).toBe(1);
      expect(requestCount(fetcher, "n.json")).toBe(2);
      expect(requestCount(fetcher, "s.json")).toBe(1);
    }
  );

  it("shares pending index and shard work, then keeps successful results", async () => {
    const pendingIndex = deferred<Response>();
    const pendingShard = deferred<Response>();
    const shardStarted = deferred<void>();
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/index.json")) return pendingIndex.promise;
      shardStarted.resolve();
      return pendingShard.promise;
    });
    const client = createGeoNamesClient({ baseUrl: "https://example.test/cities", fetch: fetcher });
    const searches = Promise.all([client.searchCities("new"), client.searchCities("new t")]);
    const metadata = client.preload();
    expect(fetcher).toHaveBeenCalledTimes(1);
    pendingIndex.resolve(json(indexData));
    await metadata;
    await shardStarted.promise;
    expect(fetcher).toHaveBeenCalledTimes(2);
    pendingShard.resolve(json(rows.n));
    const results = await searches;
    expect(results[0]).toEqual(results[1]);
    await Promise.all([client.preload(), client.searchCities("new")]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not fetch for short queries or absent shards", async () => {
    const fetcher = vi.fn(async () => json(indexData));
    const client = createGeoNamesClient({ baseUrl: "https://example.test/cities", fetch: fetcher });
    expect(await client.searchCities("n")).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await client.searchCities("west")).toEqual([]);
    expect(await client.searchCities("west")).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
