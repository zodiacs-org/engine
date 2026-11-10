import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import ICAL from "ical.js";
import { afterEach, describe, expect, it } from "vitest";
import { configureFeed } from "../src/cli-config.js";
import { MAX_CONFIG_BYTES, runCli } from "../src/cli.js";
import { streamCalendar, streamSchedule } from "../src/stream.js";
import { eclipseRequest, lunarRequest, stationRequest } from "./fixtures/synthetic-stations-eclipses.js";

const calendar = fileURLToPath(new URL("..", import.meta.url));
const launcher = path.join(calendar, "scripts/calendar.mjs");
const examplePath = path.join(calendar, "examples/synthetic-void.json");
const example = () => JSON.parse(readFileSync(examplePath, "utf8"));
const golden = readFileSync(new URL("./fixtures/synthetic-void-of-course.ics", import.meta.url), "utf8");
const files: string[] = [];
afterEach(async () => { for (const filename of files.splice(0)) await rm(filename, { recursive: true, force: true }); });

function capture() {
  let text = "";
  const stream = new Writable({ write(chunk, _encoding, done) { text += chunk.toString(); done(); } });
  return { stream, text: () => text };
}
async function invoke(value: unknown, options: Parameters<typeof runCli>[1] = {}, args = {}) {
  const stdout = capture(), stderr = capture();
  const code = await runCli({ config: "-", utc: true, ...args }, {
    stdin: Readable.from([JSON.stringify(value)]), stdout: stdout.stream, stderr: stderr.stream, ...options
  });
  return { code, stdout: stdout.text(), stderr: stderr.text() };
}
function newOutput() {
  const filename = path.join(calendar, "generated", `cli-test-${randomUUID()}.ics`);
  files.push(filename); return filename;
}
async function command(args: string[], input?: string, cwd = calendar) {
  const child = spawn(process.execPath, [launcher, ...args], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  child.stdin.end(input);
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject); child.once("close", resolve);
  });
  return { code, stdout, stderr };
}

describe("CLI subprocess and streaming integration (format and regression, not accuracy evidence)", () => {
  it("runs help and argument failures without preparing or loading the engine", async () => {
    expect(await command(["--help"], undefined, path.dirname(calendar))).toMatchObject({ code: 0, stderr: "" });
    const invalid = await command(["--unknown", "do-not-echo-this"]);
    expect(invalid).toMatchObject({ code: 1, stdout: "" });
    expect(invalid.stderr).toContain("Unknown option");
    expect(invalid.stderr).not.toContain("do-not-echo-this");
  }, 15_000);

  it("matches the committed golden on stdout from files or stdin across regenerations and working directories", async () => {
    const fromFile = await command(["--config", examplePath, "--utc"], undefined, path.dirname(calendar));
    expect(fromFile).toEqual({ code: 0, stdout: golden, stderr: "" });
    const fromStdin = await command(["--config", "-", "--utc", "--output", "-"], JSON.stringify(example()));
    expect(fromStdin).toEqual(fromFile);
  }, 20_000);

  it("parses timezone output with exact receipt instants and repeatable overridden DTSTAMP", async () => {
    const result = await command(["--config", examplePath, "--tzid", "America/New_York",
      "--dtstamp", "2026-01-02T00:00:00.000Z", "--select", "void-of-course"]);
    expect(result.code).toBe(0); expect(result.stderr).toBe("");
    const parsed = new ICAL.Component(ICAL.parse(result.stdout));
    const zone = new ICAL.Timezone(parsed.getFirstSubcomponent("vtimezone")!);
    const components = parsed.getAllSubcomponents("vevent");
    expect(components.length).toBeGreaterThan(0);
    for (const component of components) {
      const event = new ICAL.Event(component);
      const receipt = JSON.parse(component.getFirstPropertyValue("description") as string);
      event.startDate.zone = zone;
      expect(event.startDate.toUnixTime()).toBe(Math.floor(Date.parse(receipt.utc) / 1000));
      expect((component.getFirstPropertyValue("dtstamp") as ICAL.Time).toString()).toBe("2026-01-02T00:00:00Z");
    }
  }, 15_000);

  it("publishes a complete new file, keeps stdout clean and refuses overwriting it or a symlink", async () => {
    const output = newOutput();
    expect(await command(["--config", examplePath, "--utc", "--output", output]))
      .toEqual({ code: 0, stdout: "", stderr: "" });
    expect(await readFile(output, "utf8")).toBe(golden);
    expect((await lstat(output)).mode & 0o777).toBe(0o600);
    const duplicate = await invoke(example(), {}, { output });
    expect(duplicate.code).toBe(1); expect(duplicate.stderr).toContain("already exists");
    expect(await readFile(output, "utf8")).toBe(golden);
    const alias = newOutput(); await symlink(output, alias);
    expect((await invoke(example(), {}, { output: alias })).code).toBe(1);
    expect(await readFile(output, "utf8")).toBe(golden);
    expect((await readdir(path.dirname(output))).filter(name => files.some(file => name.startsWith(`.feed-${path.basename(file)}-`)))).toEqual([]);
  }, 15_000);

  it("keeps output inside generated and validates before creating target files", async () => {
    for (const output of [path.join(calendar, "illegal.ics"), path.join(calendar, "generated", "nested", "bad.ics"),
      path.join(calendar, "generated", "bad.txt")]) {
      const result = await invoke(example(), {}, { output });
      expect(result).toMatchObject({ code: 1, stdout: "" }); expect(result.stderr).toContain("--output");
    }
    const output = newOutput(), value = example(); value.schedule.maxEvaluations = 0;
    expect((await invoke(value, {}, { output })).code).toBe(1);
    await expect(lstat(output)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports budget and empty-range failures without publishing partial files", async () => {
    const output = newOutput(), value = example(); value.schedule.maxEvaluations = 1;
    const result = await invoke(value, {}, { output });
    expect(result).toMatchObject({ code: 2, stdout: "" });
    expect(result.stderr).toContain("evaluation-budget"); expect(result.stderr).toContain("selection 0");
    await expect(lstat(output)).rejects.toMatchObject({ code: "ENOENT" });
    const empty = { schema: value.schema, dtstamp: value.dtstamp, schedule: {
      ...value.schedule, maxEvaluations: 100_000, startUtc: "2026-03-01T00:00:00.000Z", endUtc: "2026-03-02T00:00:00.000Z",
      schedules: [{ kind: "ingress", request: { namespace: "synthetic-cli.calendar.invalid", body: "Sun", clock: "utc", stepMs: 3_600_000 } }]
    } };
    const emptyResult = await invoke(empty, {}, { output });
    expect(emptyResult).toMatchObject({ code: 2, stdout: "" }); expect(emptyResult.stderr).toContain("No events");
    await expect(lstat(output)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readdir(path.dirname(output))).filter(name => files.some(file => name.startsWith(`.feed-${path.basename(file)}-`)))).toEqual([]);
  });

  it("enforces the input byte limit for stdin and files and hides invalid JSON contents", async () => {
    const stdout = capture(), stderr = capture();
    const code = await runCli({ config: "-" }, { stdin: Readable.from([Buffer.alloc(MAX_CONFIG_BYTES + 1, 32)]),
      stdout: stdout.stream, stderr: stderr.stream });
    expect(code).toBe(1); expect(stderr.text()).toContain("size limit"); expect(stdout.text()).toBe("");
    for (const input of ["{secret-do-not-print}", Buffer.from([0xff])]) {
      const error = capture();
      expect(await runCli({ config: "-" }, { stdin: Readable.from([input]), stdout: capture().stream, stderr: error.stream })).toBe(1);
      expect(error.text()).toContain("UTF-8 JSON"); expect(error.text()).not.toContain("secret-do-not-print");
    }
    await mkdir(path.join(calendar, ".cache"), { recursive: true });
    const filename = path.join(calendar, ".cache", `oversize-${randomUUID()}.json`); files.push(filename);
    await writeFile(filename, Buffer.alloc(MAX_CONFIG_BYTES + 1, 32));
    const error = capture();
    expect(await runCli({ config: filename }, { stderr: error.stream, stdout: capture().stream })).toBe(1);
    expect(error.text()).toContain("size limit");
  });

  it("delegates mixed selections and each station/eclipse kind without changing receipts", async () => {
    const mixed = JSON.parse(readFileSync(new URL("../examples/synthetic-mixed.json", import.meta.url), "utf8"));
    const result = await invoke(mixed);
    expect(result.code).toBe(0); expect(result.stderr).toBe("");
    expect(new ICAL.Component(ICAL.parse(result.stdout)).getAllSubcomponents("vevent").map(component =>
      JSON.parse(component.getFirstPropertyValue("description") as string).eventType))
      .toEqual(expect.arrayContaining(["ingress", "natal-transit", "synastry-exact"]));
    for (const input of [stationRequest, eclipseRequest, lunarRequest]) {
      const { startUtc, endUtc, maxEvaluations, ...request } = input;
      const value = { schema: mixed.schema, dtstamp: mixed.dtstamp, schedule: { startUtc, endUtc,
        maxEvaluations, windowDays: 1, maxBufferedEvents: 100,
        schedules: [{ kind: "kind" in request ? "eclipse" : "station", request }] } };
      const { request: selected, options } = configureFeed(value);
      let expected = ""; for await (const chunk of streamCalendar(streamSchedule(selected), options)) expected += chunk;
      expect(await invoke(value)).toEqual({ code: 0, stdout: expected, stderr: "" });
      expect(new ICAL.Component(ICAL.parse(expected)).getAllSubcomponents("vevent").length).toBeGreaterThan(0);
    }
  }, 30_000);

  it("cancels a pending stdin read and handles a broken output pipe", async () => {
    const controller = new AbortController(), stdin = new Readable({ read() {} }), stderr = capture();
    const pending = runCli({ config: "-" }, { stdin, signal: controller.signal, stdout: capture().stream, stderr: stderr.stream });
    controller.abort();
    expect(await pending).toBe(130); expect(stderr.text()).toContain("cancelled");
    expect(stdin.destroyed).toBe(true);
    const broken = new Writable({ write(_chunk, _encoding, done) {
      done(Object.assign(new Error("closed"), { code: "EPIPE" }));
    } });
    const result = await invoke(example(), { stdout: broken });
    expect(result.code).toBe(141); expect(result.stderr).toContain("Output pipe closed");
  });

  it("cancels an actual process after streaming begins, without a success footer", async () => {
    const value = JSON.parse(readFileSync(new URL("../examples/synthetic-mixed.json", import.meta.url), "utf8"));
    value.schedule.schedules = [value.schedule.schedules[0]];
    value.schedule.endUtc = "2029-02-01T00:00:00.000Z";
    const child = spawn(process.execPath, [launcher, "--config", "-"], { cwd: calendar, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", stopped = false;
    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
      if (!stopped) { stopped = true; child.kill("SIGINT"); }
    });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.stdin.end(JSON.stringify(value));
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject); child.once("close", resolve);
    });
    expect(code).toBe(130); expect(stderr).toContain("cancelled");
    expect(stdout).toContain("BEGIN:VCALENDAR"); expect(stdout).not.toContain("END:VCALENDAR");
  }, 20_000);
});
