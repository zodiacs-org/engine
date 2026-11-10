import { describe, expect, it } from "vitest";
import { RedisMockServer } from "./redis-mock.js";

describe("Redis Lua mock boundary", () => {
  it("executes Lua with shared hashes, Redis missing values and command logging", async () => {
    const server = new RedisMockServer();
    const first = server.client();
    const second = server.client();
    const increment = `
      local current = tonumber(redis.call('HGET', KEYS[1], 'counter')) or 0
      redis.call('HSET', KEYS[1], 'counter', current + 1, 'label', ARGV[1])
      return redis.call('HMGET', KEYS[1], 'counter', 'label', 'missing')
    `;
    const results = await Promise.all([
      first.sendCommand(["EVAL", increment, "1", "mock-counter", "first"]),
      second.sendCommand(["EVAL", increment, "1", "mock-counter", "second"]),
    ]);
    expect(results).toEqual([["1", "first", false], ["2", "second", false]]);
    expect(server.getHash("mock-counter").get("counter")).toBe("2");
    expect(first.commands).toHaveLength(1);
    expect(second.commands).toHaveLength(1);
    expect(server.commands).toHaveLength(2);
    expect(server.redisCommands.map((command) => command[0]))
      .toEqual(["HGET", "HSET", "HMGET", "HGET", "HSET", "HMGET"]);
  });

  it("uses double arithmetic for epoch time and bridges null, arrays and strings", async () => {
    const server = new RedisMockServer(() => 1_700_000_000_123);
    const result = await server.client().sendCommand(["EVAL", `
      local clock = redis.call('TIME')
      local input = cjson.decode(ARGV[1])
      assert(input.absent == cjson.null)
      assert(input.items[2] == false)
      return cjson.encode({
        now = tonumber(clock[1]) * 1000 + tonumber(clock[2]) / 1000,
        value = input,
        empty = cjson.decode('[]')
      })
    `, "0", JSON.stringify({ absent: null, items: [1, false], label: 'mock "é"\n\u0000' })]);
    expect(JSON.parse(String(result))).toEqual({
      now: 1_700_000_000_123,
      value: { absent: null, items: [1, false], label: 'mock "é"\n\u0000' },
      empty: {},
    });
  });

  it("injects failed delivery before execution and lost acknowledgements after writes", async () => {
    const server = new RedisMockServer();
    const client = server.client();
    const write = ["EVAL", "return redis.call('HSET', KEYS[1], 'field', ARGV[1])", "1", "failures", "written"];
    const before = new Error("synthetic before failure");
    client.failNext("before", before);
    await expect(client.sendCommand(write)).rejects.toBe(before);
    expect(server.getHash("failures").size).toBe(0);
    const after = new Error("synthetic after failure");
    client.failNext("after", after);
    await expect(client.sendCommand(write)).rejects.toBe(after);
    expect(server.getHash("failures").get("field")).toBe("written");
  });

  it("defers delivery and replies independently while allowing other client commands", async () => {
    const server = new RedisMockServer();
    const first = server.client();
    const second = server.client();
    const write = (value: string) => ["EVAL", "return redis.call('HSET', KEYS[1], 'field', ARGV[1])", "1", "race", value];
    const before = first.deferNext("before");
    const delayedDelivery = first.sendCommand(write("delayed"));
    await before.entered;
    await second.sendCommand(write("overtook"));
    expect(server.getHash("race").get("field")).toBe("overtook");
    before.release();
    await delayedDelivery;
    const after = first.deferNext("after");
    const delayedReply = first.sendCommand(write("committed"));
    await after.entered;
    expect(server.getHash("race").get("field")).toBe("committed");
    await second.sendCommand(write("overtook-reply"));
    after.release();
    await delayedReply;
    expect(server.getHash("race").get("field")).toBe("overtook-reply");
  });

  it("propagates Lua and Redis errors without inventing script rollback", async () => {
    const server = new RedisMockServer();
    const client = server.client();
    await expect(client.sendCommand(["EVAL", `
      redis.call('HSET', KEYS[1], 'field', 'retained')
      error('synthetic failure after mutation')
    `, "1", "script-error"])).rejects.toThrow("synthetic failure after mutation");
    expect(server.getHash("script-error").get("field")).toBe("retained");
    server.setString("wrong-type", "synthetic scalar");
    await expect(client.sendCommand(["EVAL", "return redis.call('HGET', KEYS[1], 'field')", "1", "wrong-type"]))
      .rejects.toThrow("WRONGTYPE");
    expect(await client.sendCommand(["EVAL", "return cjson.encode(redis.call('TYPE', KEYS[1]))", "1", "wrong-type"]))
      .toBe('{"ok":"string"}');
    await expect(client.sendCommand(["EVAL", "this is not Lua", "0"]))
      .rejects.toThrow();
  });
});
