import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { lstat, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_FILE_BYTES, runCli } from "../src/cli.js";

const state = vi.hoisted(() => ({ chunks: [] as string[], fail: false }));
vi.mock("../src/stream.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../src/stream.js")>();
  return { ...actual, streamCalendar: async function* () {
    for (const chunk of state.chunks) yield chunk;
    if (state.fail) throw new actual.ScheduleStreamError("evaluation-budget", 200, 1,
      { startUtc: "2026-02-02T00:00:00.000Z", endUtc: "2026-02-03T00:00:00.000Z" }, 0);
  } };
});
const generated = fileURLToPath(new URL("../generated/", import.meta.url));
const example = readFileSync(new URL("../examples/synthetic-void.json", import.meta.url), "utf8");
const files: string[] = [];
afterEach(async () => {
  state.fail = false; state.chunks = [];
  for (const filename of files.splice(0)) await rm(filename, { force: true });
});
function output() { const value = `${generated}cli-output-${randomUUID()}.ics`; files.push(value); return value; }
async function run(target?: string) {
  let stderr = "", stdoutBytes = 0;
  const code = await runCli({ config: "-", utc: true, ...(target === undefined ? {} : { output: target }) }, {
    stdin: Readable.from([example]), stdout: new Writable({ write(chunk, _encoding, done) { stdoutBytes += chunk.length; done(); } }),
    stderr: new Writable({ write(chunk, _encoding, done) { stderr += chunk.toString(); done(); } })
  });
  return { code, stderr, stdoutBytes };
}

describe("file publication limits with invented wire chunks", () => {
  it("accepts the exact file byte limit and rejects a UTF-8 chunk that exceeds it", async () => {
    const target = output(); state.chunks = ["x".repeat(MAX_FILE_BYTES)];
    expect(await run(target)).toEqual({ code: 0, stderr: "", stdoutBytes: 0 });
    expect((await readFile(target)).length).toBe(MAX_FILE_BYTES);
    const oversized = output(); state.chunks = ["x".repeat(MAX_FILE_BYTES - 1), "月"];
    const failed = await run(oversized);
    expect(failed.code).toBe(1); expect(failed.stderr).toContain("size limit");
    await expect(lstat(oversized)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readdir(generated)).filter(name => files.some(file => name.startsWith(`.feed-${path.basename(file)}-`)))).toEqual([]);
    expect(await run()).toEqual({ code: 0, stderr: "", stdoutBytes: MAX_FILE_BYTES + 2 });
  });

  it("removes a partially written file on a late search refusal and diagnoses earlier stdout bytes", async () => {
    // Search behaviour is tested by adapter integration; this exercises transport failure after a write.
    state.chunks = ["BEGIN:VCALENDAR\r\n", "BEGIN:VEVENT\r\nEND:VEVENT\r\n"]; state.fail = true;
    const target = output(), fileResult = await run(target);
    expect(fileResult).toMatchObject({ code: 2, stdoutBytes: 0 });
    expect(fileResult.stderr).toContain("1 events emitted");
    await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
    const direct = await run(); expect(direct.code).toBe(2); expect(direct.stdoutBytes).toBeGreaterThan(0);
    expect(direct.stderr).toContain("evaluation-budget");
    expect((await readdir(generated)).filter(name => files.some(file => name.startsWith(`.feed-${path.basename(file)}-`)))).toEqual([]);
  });
});
