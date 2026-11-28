import assert from "node:assert/strict";
import fs from "node:fs";
import promises from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import dns from "node:dns";
import childProcess from "node:child_process";
import timers from "node:timers";
import timerPromises from "node:timers/promises";
import { syncBuiltinESMExports } from "node:module";

// Read the in-memory audit bundle before blocking application I/O. Importing
// it by data URL excludes the TypeScript loader's own source-file reads.
// This is a Node API regression guard, not an OS sandbox or a security scan.
const { source, mode } = JSON.parse(fs.readFileSync(0, "utf8"));
const attempts = [];
const denied = (name) => function () {
  attempts.push(name);
  throw new Error(`Import audit blocked ${name}`);
};
function block(object, names, kind) {
  for (const name of names) if (typeof object[name] === "function") object[name] = denied(`${kind}.${name}`);
}
block(fs, Object.keys(fs), "fs");
block(promises, Object.keys(promises), "fs.promises");
block(childProcess, Object.keys(childProcess), "child_process");
for (const object of [http, https]) block(object, ["request", "get"], "http");
block(net, ["connect", "createConnection"], "net");
block(net.Socket.prototype, ["connect"], "socket");
block(net.Server.prototype, ["listen"], "server");
block(tls, ["connect"], "tls");
block(dgram.Socket.prototype, ["bind", "connect", "send"], "dgram");
block(dns, Object.keys(dns).filter((name) => name === "lookup" || name.startsWith("resolve")), "dns");
block(dns.promises, Object.keys(dns.promises).filter((name) => name === "lookup" || name.startsWith("resolve")), "dns.promises");
globalThis.fetch = denied("fetch");
for (const name of ["setTimeout", "setInterval", "setImmediate"]) {
  globalThis[name] = timers[name] = denied(name);
}
block(timerPromises, ["setTimeout", "setInterval", "setImmediate"], "timers.promises");
const dateTimeFormat = Intl.DateTimeFormat;
Intl.DateTimeFormat = denied("Intl.DateTimeFormat");
syncBuiltinESMExports();
const environment = { ...process.env };
const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

if (mode === "control") {
  console.log(JSON.stringify({ detected: attempts.length > 0 }));
} else {
  assert.deepEqual(attempts, [], "import attempted guarded work");
  const record = {
    id: "synthetic:amber", name: "Amber Harbour", asciiName: "Amber Harbour",
    aliases: ["Port of Amber"], countryCode: "ZZ", countryName: "Example Republic",
    regionCode: "01", regionName: "North Reach", latitude: 12, longitude: -45,
    elevationMeters: null, demElevationMeters: null, population: null, timeZone: null
  };
  const dataset = {
    schemaVersion: 1,
    provenance: { dataset: "synthetic", license: "MIT", attribution: "Invented acceptance records", sources: [] },
    places: [record]
  };
  const atlas = { resolve() { throw new Error("Synthetic records must bypass the atlas"); } };
  const geocoder = api.createGeocoder(dataset, atlas);
  assert.equal(geocoder.lookup("Port of Amber, ZZ").status, "unique");
  const dateOnly = await geocoder.resolve({ placeId: record.id, date: "2000-01-01" });
  assert.equal(dateOnly.status, "date-only");
  assert.equal(dateOnly.time, null);
  const missing = await geocoder.resolve({ placeId: record.id, date: "2000-01-01", time: "08:30" });
  assert.equal(missing.time.reason, "missing-timezone");
  if (mode === "optional") {
    for (const name of ["loadAtlasTimeProvider", "loadPlaceIndex", "createGeocodeServer"]) {
      assert.equal(typeof api[name], "function");
    }
    const server = api.createGeocodeServer(geocoder);
    await server.close();
    await server.close();
  }
  assert.deepEqual(attempts, [], "factory or untimed query attempted guarded work");

  // Intl access belongs to timed resolution. File/network/listener/timer
  // guards remain active, including while bundled historical shards load.
  Intl.DateTimeFormat = dateTimeFormat;
  for (const [date, timeZone, sourceKind] of [
    ["2000-01-01", "Asia/Kathmandu", "intl"],
    ["1945-06-01", "Europe/London", "tzdb"]
  ]) {
    const timed = api.createGeocoder({ ...dataset, places: [{ ...record, timeZone }] }, atlas);
    const result = await timed.resolve({ placeId: record.id, date, time: "08:30" });
    assert.equal(result.time.provider, "iana");
    assert.equal(result.time.status, "ok");
    assert.equal(result.time.resolution.zone.source, sourceKind);
    assert(Number.isFinite(result.time.resolution.utc.getTime()));
  }
  assert.deepEqual(attempts, [], "timed query attempted guarded I/O");
  assert.deepEqual({ ...process.env }, environment, "library changed environment variables");
  console.log(JSON.stringify({ mode, passed: true }));
}
