import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import ICAL from "ical.js";
import { afterEach, describe, expect, it } from "vitest";

const launcher = fileURLToPath(new URL("../scripts/serve.mjs", import.meta.url));
const configuration = fileURLToPath(new URL("../examples/synthetic-server.json", import.meta.url));
const children: ChildProcess[] = [];
afterEach(async () => {
  await Promise.all(children.splice(0).map(async child => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const closed = once(child, "close"); child.kill("SIGTERM"); await closed;
  }));
});
function run(args: string[], cwd = fileURLToPath(new URL("..", import.meta.url))) {
  const child = spawn(process.execPath, [launcher, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  let stdout = "", stderr = "";
  child.stdout!.on("data", chunk => { stdout += chunk.toString(); });
  child.stderr!.on("data", chunk => { stderr += chunk.toString(); });
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject); child.once("close", resolve);
  });
  return { child, closed, stdout: () => stdout, stderr: () => stderr };
}

describe("local HTTP server launcher", () => {
  it("serves the committed synthetic map from another working directory and stops cleanly", async () => {
    const process = run(["--config", configuration, "--port", "0"], fileURLToPath(new URL("../..", import.meta.url)));
    await expect.poll(process.stdout, { timeout: 10_000 }).toMatch(/Calendar feeds: http:\/\/127\.0\.0\.1:\d+\/feeds\/ID\.ics/);
    const base = process.stdout().match(/http:\/\/127\.0\.0\.1:\d+/)![0];
    const response = await fetch(`${base}/feeds/synthetic-void.ics`);
    expect(response.status).toBe(200);
    const text = await response.text();
    const feed = new ICAL.Component(ICAL.parse(text));
    expect(feed.getFirstSubcomponent("vtimezone")).not.toBeNull();
    const events = feed.getAllSubcomponents("vevent");
    expect(events.length).toBeGreaterThan(0);
    for (const component of events) {
      expect(JSON.parse(new ICAL.Event(component).description)).toMatchObject({
        schema: "zodiacs-calendar-receipt/1", eventType: "void-of-course", bodies: ["Moon", "Sun", "Venus"], orbDegrees: null
      });
    }
    process.child.kill("SIGTERM"); expect(await process.closed).toBe(0);
    expect(process.stderr()).toBe("");
  }, 20_000);

  it("reports help and rejects invalid arguments and non-feed files without leaking submitted details", async () => {
    const help = run(["--help"]); expect(await help.closed).toBe(0);
    expect(help.stdout()).toContain("Usage:"); expect(help.stderr()).toBe("");
    for (const args of [[], ["--config"], ["--unknown", "private-details"], ["--help", "--config", configuration],
      ["--config", configuration, "--port", "65536"], ["--config", configuration, "--port", "1e3"],
      ["--config", configuration, "--config", configuration],
      ["--config", fileURLToPath(new URL("../examples/synthetic-void.json", import.meta.url))]]) {
      const invalid = run(args); expect(await invalid.closed).toBe(1);
      expect(invalid.stdout()).toBe(""); expect(invalid.stderr()).toContain("startup failure");
      expect(invalid.stderr()).not.toContain("private-details"); expect(invalid.stderr()).not.toContain(configuration);
    }
  }, 20_000);
});
