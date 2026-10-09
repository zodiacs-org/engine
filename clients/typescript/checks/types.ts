import type { ComputeClient, ComputeSchemas } from "../src/index.js";
declare const client: ComputeClient;
client.positions({ instants: ["2026-09-29T12:00:00Z"], bodies: ["Sun", "Moon"] });
client.chart({ utc: "2000-01-01T12:00:00Z", latitude: 51.4779, longitude: -0.0015 });
client.chart({ local: { date: "1990-06-15", time: "14:30", zone: "Europe/Paris" }, latitude: 48.8566, longitude: 2.3522 });
// @ts-expect-error A chart must choose utc or local.
client.chart({ latitude: 51.4779, longitude: -0.0015 });
// @ts-expect-error A chart cannot contain both utc and local.
client.chart({ utc: "2000-01-01T12:00:00Z", local: { date: "1990-06-15", time: "14:30", zone: "Europe/Paris" }, latitude: 48.8566, longitude: 2.3522 });
// @ts-expect-error Unknown bodies are not request vocabulary.
client.positions({ instants: ["2026-09-29T12:00:00Z"], bodies: ["Invented body"] });
// @ts-expect-error Positions does not accept a birth place.
client.positions({ instants: ["2026-09-29T12:00:00Z"], latitude: 1 });
// @ts-expect-error Unknown endpoints are refused by the type contract too.
client.call("unknown", {});
async function responseTypes() {
  const result: ComputeSchemas["PositionsResponse"] = await client.positions({ instants: ["2026-09-29T12:00:00Z"] });
  const version: string = result.backend.version;
  return version;
}
void responseTypes;

client.skyFact({ kind: "sign", body: "Moon", sign: "aries", instant: "2000-01-01T12:00:00Z" });
client.skyFact({ kind: "retrograde", body: "Mercury", date: "2000-01-01", zone: "Europe/Paris" });
// @ts-expect-error An instant cannot also select a local date.
client.skyFact({ kind: "sign", body: "Moon", sign: "aries", instant: "2000-01-01T12:00:00Z", date: "2000-01-01" });
// @ts-expect-error An instant cannot select a local zone.
client.skyFact({ kind: "retrograde", body: "Mercury", instant: "2000-01-01T12:00:00Z", zone: "Europe/Paris" });
// @ts-expect-error Sign facts require an instant or a date.
client.skyFact({ kind: "sign", body: "Moon", sign: "aries" });
