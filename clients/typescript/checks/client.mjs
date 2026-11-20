import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createComputeClient, ComputeHttpError, ComputeProtocolError, ComputeTimeoutError,
} from "../dist/index.js";

const contract = JSON.parse(await readFile(new URL("../contracts/openapi.json", import.meta.url), "utf8"));
const fixtures = Object.fromEntries(Object.entries(contract.paths).map(([path, entry]) => {
  const request = entry.post.requestBody.content["application/json"].examples;
  const key = Object.keys(request)[0];
  return [path.replace("/api/v1/", ""), {
    request: request[key].value,
    response: entry.post.responses["200"].content["application/json"].examples[key].value,
  }];
}));
const positions = fixtures.positions;
function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", ...headers } });
}

for (const [endpoint, fixture] of Object.entries(fixtures)) {
  test(endpoint + ": POST-only body and complete public contract envelope", async () => {
    let calls = 0;
    const client = createComputeClient({ fetch: async (url, init) => {
      calls++;
      assert.equal(String(url), "https://zodiacs.org/api/v1/" + endpoint);
      assert.equal(new URL(url).search, "");
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(init.body), fixture.request);
      assert.equal(init.credentials, "omit");
      assert.equal(init.redirect, "error");
      assert.equal(init.cache, "no-store");
      assert.equal(init.headers["Content-Type"], "application/json");
      return json(fixture.response);
    } });
    const result = await client.call(endpoint, fixture.request);
    assert.deepEqual(result, fixture.response);
    assert.equal(calls, 1);
  });
}
test("all convenience methods use the matching endpoint", async () => {
  const seen = [];
  const client = createComputeClient({ fetch: async (url) => {
    const endpoint = new URL(url).pathname.replace("/api/v1/", "");
    seen.push(endpoint);
    return json(fixtures[endpoint].response);
  } });
  for (const endpoint of Object.keys(fixtures)) {
    const method = endpoint === "sky-fact" ? "skyFact" : endpoint;
    await client[method](fixtures[endpoint].request);
  }
  assert.deepEqual(seen, Object.keys(fixtures));
});
for (const status of [400, 413, 422, 429, 503]) {
  test("preserves HTTP " + status + " and Retry-After without retrying", async () => {
    let calls = 0;
    const failure = { error: { code: "synthetic-refusal", message: "Synthetic refusal" } };
    const client = createComputeClient({ fetch: async () => {
      calls++;
      return json(failure, status, { "Retry-After": "60" });
    } });
    await assert.rejects(client.positions(positions.request), (error) => {
      assert.ok(error instanceof ComputeHttpError);
      assert.equal(error.status, status);
      assert.equal(error.retryAfter, "60");
      assert.deepEqual(error.response, failure);
      assert.equal(error.message, "Compute request failed with HTTP " + status);
      return true;
    });
    assert.equal(calls, 1);
  });
}
test("preserves an HTTP failure's non-JSON body separately from its message", async () => {
  const client = createComputeClient({ fetch: async () => new Response("synthetic-body", { status: 502 }) });
  await assert.rejects(client.positions(positions.request), (error) => {
    assert.ok(error instanceof ComputeHttpError);
    assert.equal(error.response, "synthetic-body");
    assert.equal(error.retryAfter, null);
    assert.equal(error.message.includes("synthetic-body"), false);
    return true;
  });
});
for (const malformed of [{}, { ...positions.response, schema: "wrong" }, { ...positions.response, receipt: null }]) {
  test("rejects a malformed successful envelope", async () => {
    const client = createComputeClient({ fetch: async () => json(malformed) });
    await assert.rejects(client.positions(positions.request), ComputeProtocolError);
  });
}
test("rejects a non-JSON success with a fixed protocol error", async () => {
  const client = createComputeClient({ fetch: async () => new Response("synthetic-private-response") });
  await assert.rejects(client.positions(positions.request), (error) => {
    assert.ok(error instanceof ComputeProtocolError);
    assert.equal(error.message.includes("synthetic-private-response"), false);
    return true;
  });
});
test("caller cancellation reaches an active fetch", async () => {
  const controller = new AbortController();
  const reason = new Error("Synthetic cancellation");
  let ready;
  const started = new Promise((resolve) => { ready = resolve; });
  const client = createComputeClient({ fetch: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    ready();
  }) });
  const pending = client.positions(positions.request, { signal: controller.signal });
  await started;
  controller.abort(reason);
  await assert.rejects(pending, (error) => error === reason);
});
test("already-aborted calls never send a request", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const client = createComputeClient({ fetch: async () => { calls++; return json(positions.response); } });
  await assert.rejects(client.positions(positions.request, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 0);
});
test("finite timeout aborts an active fetch", async () => {
  const client = createComputeClient({ timeoutMs: 20, fetch: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  }) });
  await assert.rejects(client.positions(positions.request), ComputeTimeoutError);
});
test("real native fetch timeout covers response-body reading", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write("{");
  });
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  try {
    const client = createComputeClient({ origin: "http://127.0.0.1:" + server.address().port, timeoutMs: 100 });
    await assert.rejects(client.positions(positions.request), ComputeTimeoutError);
  } finally {
    server.closeAllConnections();
    await new Promise((closed) => server.close(closed));
  }
});
test("rejects credentials, URL paths and non-HTTP origins", () => {
  for (const origin of ["https://user:password@example.invalid", "https://example.invalid/path", "https://example.invalid/?x=1", "https://example.invalid/#fragment", "file:///tmp/"]) {
    assert.throws(() => createComputeClient({ origin }), RangeError);
  }
});
test("rejects unbounded or invalid timeouts", () => {
  for (const timeoutMs of [0, -1, NaN, Infinity, 60_001]) assert.throws(() => createComputeClient({ timeoutMs }), RangeError);
});
test("rejects unknown endpoints before transport", async () => {
  let calls = 0;
  const client = createComputeClient({ fetch: async () => { calls++; return json(positions.response); } });
  await assert.rejects(client.call("../unrelated", {}), RangeError);
  assert.equal(calls, 0);
});

test("cancellation during request serialization sends no request", async () => {
  const controller = new AbortController();
  const reason = new Error("Synthetic cancellation during serialization");
  let calls = 0;
  const request = { ...positions.request, toJSON() { controller.abort(reason); return positions.request; } };
  const client = createComputeClient({ fetch: async () => { calls++; return json(positions.response); } });
  await assert.rejects(client.positions(request, { signal: controller.signal }), (error) => error === reason);
  assert.equal(calls, 0);
});

const timeScale = contract.components.schemas.TimeScale.properties;
function timeScaleLiteralsMatch(scale) {
  return timeScale.input.const === scale.input && timeScale.basis.enum.includes(scale.basis)
    && (scale.ut1MinusUtc === null || timeScale.ut1MinusUtc.anyOf[0].properties.source.enum.includes(scale.ut1MinusUtc.source));
}
// TABLE_END in scripts/continuous-utc-instants.mjs is 2027-10-02T00:00:00.000Z.
// That UTC instant keeps the iers basis. The synthetic 2030 result uses
// continuous UTC and puts TT 69.184 s ahead of UTC.
const atTableEnd = {
  input: "utc",
  basis: "iers",
  ut1MinusUtc: { seconds: -0.148, sigma: 0.0262, source: "predicted" },
  leapSeconds: { taiMinusUtc: 37, listed: false },
};
const in2030 = {
  utc: "2030-01-01T00:00:00.000Z",
  offsetMinutes: 0,
  flags: [],
  localMeanTime: null,
  zoneHistory: "runtime",
  zoneUncertain: false,
  tt: "2030-01-01T00:01:09.184",
  deltaT: {
    seconds: 69.602296295502,
    sigma: 0.710146195012318,
    model: "zodiacs-deltat/1",
    table: "2026-09-24",
    tableDigest: "6371988c510a1c6c",
    segment: "extrapolated",
  },
  timeScale: {
    input: "utc",
    basis: "continuous-utc",
    ut1MinusUtc: { seconds: -0.4182962955020031, sigma: 0.710146195012318, source: "model" },
    leapSeconds: { taiMinusUtc: 37, listed: false },
  },
};
test("time: a 2030 answer on the continuous-UTC basis is in the contract and returned whole", async () => {
  assert.equal(Date.parse(in2030.tt + "Z") - Date.parse(in2030.utc), 69_184);
  assert.ok(timeScaleLiteralsMatch(atTableEnd));
  assert.ok(timeScaleLiteralsMatch(in2030.timeScale));
  const deltaT = contract.components.schemas.DeltaT.properties;
  assert.ok(deltaT.model.enum.includes(in2030.deltaT.model));
  assert.ok(deltaT.segment.enum.includes(in2030.deltaT.segment));
  const response = { ...fixtures.time.response, result: in2030 };
  const client = createComputeClient({ fetch: async () => json(response) });
  assert.deepEqual(await client.time({ local: { date: "2030-01-01", time: "00:00", zone: "UTC" } }), response);
});
test("time: misspelt continuous-UTC values are outside the contract", () => {
  const scale = in2030.timeScale;
  assert.equal(timeScaleLiteralsMatch({ ...scale, basis: "continuous" }), false);
  assert.equal(timeScaleLiteralsMatch({ ...scale, ut1MinusUtc: { ...scale.ut1MinusUtc, source: "modelled" } }), false);
});
