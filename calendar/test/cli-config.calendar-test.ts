import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { configureFeed } from "../src/cli-config.js";
import { CLI_HELP, parseCliArguments } from "../src/cli-options.js";

const example = () => JSON.parse(readFileSync(new URL("../examples/synthetic-mixed.json", import.meta.url), "utf8"));
const voidExample = () => JSON.parse(readFileSync(new URL("../examples/synthetic-void.json", import.meta.url), "utf8"));

describe("CLI argument and feed validation before search", () => {
  it("parses explicit overrides and help", () => {
    expect(parseCliArguments(["--help"])).toEqual({ help: true });
    expect(CLI_HELP).toContain("--config");
    expect(parseCliArguments(["--config", "-", "--output", "-", "--select", "ingress,station",
      "--start", "2026-02-02T00:00:00.000Z", "--end", "2026-02-05T00:00:00.000Z",
      "--dtstamp", "2026-01-01T00:00:00.000Z", "--utc"])).toMatchObject({ config: "-", output: "-",
      select: ["ingress", "station"], startUtc: "2026-02-02T00:00:00.000Z", endUtc: "2026-02-05T00:00:00.000Z", utc: true });
  });

  it.each([[], ["--config"], ["--config", ""], ["--config", "x", "--help"], ["--config", "x", "--unknown", "x"],
    ["--config", "x", "--config", "y"], ["--config", "x", "--select", "station,station"],
    ["--config", "x", "--select", "typo"], ["--config", "x", "--select", "ingress,"],
    ["--config", "x", "--output", "--utc"], ["--config", "x", "--utc", "--tzid", "Asia/Bangkok"],
    ["--config", "x", "--utc", "--utc"], ["--config", "x\nsecret"]].map(argv => ({ argv })))("refuses malformed flags: $argv", ({ argv }) => {
    expect(() => parseCliArguments(argv)).toThrow();
  });

  it("selects kinds, overrides range and revision, and supports UTC/TZID", () => {
    const full = configureFeed(example());
    expect(full.request.schedules.map(item => item.kind)).toEqual(["ingress", "natal-transit", "synastry-exact", "station", "eclipse"]);
    const selected = configureFeed(example(), { select: ["station", "ingress"],
      startUtc: "2026-02-02T00:00:00.000Z", endUtc: "2026-02-05T00:00:00.000Z", dtstamp: "2026-01-02T00:00:00.000Z" });
    expect(selected.request.schedules.map(item => item.kind)).toEqual(["ingress", "station"]);
    expect(selected.options.dtstamp).toBe("2026-01-02T00:00:00.000Z");
    expect(configureFeed(voidExample()).options.timeZone?.tzid).toBe("Asia/Bangkok");
    expect(configureFeed(voidExample(), { tzid: "America/New_York" }).options.timeZone?.tzid).toBe("America/New_York");
    expect(configureFeed(voidExample(), { utc: true }).options.timeZone).toBeUndefined();
    expect(() => configureFeed(example(), { tzid: "Asia/Bangkok" })).toThrow(/coverage/);
    expect(() => configureFeed(example(), { select: ["void-of-course"] })).toThrow(/absent/);
  });

  it("rejects malformed schedules, clocks, policies, charts and work limits even if unselected", () => {
    const mutations: ((value: ReturnType<typeof example>) => void)[] = [
      value => { value.schema = "unknown"; }, value => { delete value.dtstamp; },
      value => { value.dtstamp = "2026-01-01"; }, value => { value.extra = true; },
      value => { value.schedule.startUtc = "2026-02-30T00:00:00.000Z"; },
      value => { value.schedule.endUtc = value.schedule.startUtc; },
      value => { value.schedule.maxEvaluations = 0; }, value => { value.schedule.windowDays = 32; },
      value => { value.schedule.maxBufferedEvents = 0; }, value => { value.schedule.signal = {}; },
      value => { value.schedule.schedules = []; }, value => { value.schedule.schedules[0].kind = "unknown"; },
      value => { value.schedule.schedules[0].request.clock = "tt"; },
      value => { value.schedule.schedules[0].request.body = "unknown"; },
      value => { value.schedule.schedules[0].request.stepMs = 7; },
      value => { value.schedule.schedules[0].request.startUtc = value.schedule.startUtc; },
      value => { value.schedule.schedules[1].request.natal.synthetic = false; },
      value => { value.schedule.schedules[1].request.natal.birth.timeScale = "ut1"; },
      value => { value.schedule.schedules[1].request.natal.birth.latitude = 91; },
      value => { value.schedule.schedules[1].request.policy.aspects = []; },
      value => { value.schedule.schedules[2].request.convention = "static"; },
      value => { value.schedule.schedules[4].request.model.sunRadiusAu = -1; }
    ];
    for (const mutate of mutations) {
      const value = example(); mutate(value);
      expect(() => configureFeed(value, { select: ["ingress"] })).toThrow();
    }
    for (const mutate of [
      (value: ReturnType<typeof example>) => { value.timeZone.extra = "hidden"; },
      (value: ReturnType<typeof example>) => { value.timeZone.tzid = "not-a-zone"; },
      (value: ReturnType<typeof example>) => { value.timeZone.startUtc = "2026-02-02T00:00:00.000Z"; }
    ]) {
      const value = voidExample(); mutate(value);
      expect(() => configureFeed(value, { utc: true })).toThrow();
    }
  });
});
