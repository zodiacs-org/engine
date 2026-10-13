import { createRequire } from "node:module";

// This helper executes the production Lua, rather than duplicating queue state
// transitions in JavaScript. Fengari implements Lua 5.3, not Redis's Lua 5.1.
// Its tonumber shim below avoids its 32-bit integer multiplication when Redis
// would use doubles. This is not a Redis server, persistence or protocol test.
interface LuaState { readonly __luaState: unique symbol }
interface Fengari {
  to_luastring(value: string): Uint8Array;
  lua: {
    readonly LUA_OK: number;
    readonly LUA_TNIL: number;
    readonly LUA_TBOOLEAN: number;
    readonly LUA_TNUMBER: number;
    readonly LUA_TSTRING: number;
    readonly LUA_TTABLE: number;
    readonly LUA_TLIGHTUSERDATA: number;
    lua_absindex(state: LuaState, index: number): number;
    lua_close(state: LuaState): void;
    lua_createtable(state: LuaState, array: number, record: number): void;
    lua_error(state: LuaState): never;
    lua_gettop(state: LuaState): number;
    lua_next(state: LuaState, index: number): boolean;
    lua_pcall(state: LuaState, args: number, results: number, handler: number): number;
    lua_pop(state: LuaState, count: number): void;
    lua_pushboolean(state: LuaState, value: boolean): void;
    lua_pushjsfunction(state: LuaState, callback: (state: LuaState) => number): void;
    lua_pushlightuserdata(state: LuaState, value: object): void;
    lua_pushnil(state: LuaState): void;
    lua_pushnumber(state: LuaState, value: number): void;
    lua_pushstring(state: LuaState, value: Uint8Array): void;
    lua_rawseti(state: LuaState, index: number, key: number): void;
    lua_setfield(state: LuaState, index: number, key: Uint8Array): void;
    lua_setglobal(state: LuaState, key: Uint8Array): void;
    lua_toboolean(state: LuaState, index: number): boolean;
    lua_tojsstring(state: LuaState, index: number): string | null;
    lua_tonumber(state: LuaState, index: number): number;
    lua_topointer(state: LuaState, index: number): object;
    lua_touserdata(state: LuaState, index: number): unknown;
    lua_type(state: LuaState, index: number): number;
  };
  lauxlib: {
    luaL_newstate(): LuaState;
    luaL_loadstring(state: LuaState, source: Uint8Array): number;
  };
  lualib: { luaL_openlibs(state: LuaState): void };
}

// Fengari does not publish TypeScript declarations. Keep its narrow C API
// boundary typed here, without adding an ambient declaration to production.
const { lua, lauxlib, lualib, to_luastring } = createRequire(import.meta.url)("fengari") as Fengari;
const jsonNull = Object.freeze({});

function push(state: LuaState, value: unknown): void {
  if (value === null) { lua.lua_pushlightuserdata(state, jsonNull); return; }
  switch (typeof value) {
    case "undefined": lua.lua_pushnil(state); return;
    case "boolean": lua.lua_pushboolean(state, value); return;
    case "number": lua.lua_pushnumber(state, value); return;
    case "string": lua.lua_pushstring(state, to_luastring(value)); return;
    case "object": {
      if (Array.isArray(value)) {
        lua.lua_createtable(state, value.length, 0);
        for (const [index, entry] of value.entries()) {
          push(state, entry);
          lua.lua_rawseti(state, -2, index + 1);
        }
      } else {
        const entries = Object.entries(value);
        lua.lua_createtable(state, 0, entries.length);
        for (const [key, entry] of entries) {
          push(state, entry);
          lua.lua_setfield(state, -2, to_luastring(key));
        }
      }
      return;
    }
    default: throw new TypeError("Unsupported JavaScript value in Lua mock.");
  }
}

function read(state: LuaState, index: number, seen = new Set<object>()): unknown {
  switch (lua.lua_type(state, index)) {
    case lua.LUA_TNIL: return null;
    case lua.LUA_TBOOLEAN: return lua.lua_toboolean(state, index);
    case lua.LUA_TNUMBER: return lua.lua_tonumber(state, index);
    case lua.LUA_TSTRING: return lua.lua_tojsstring(state, index);
    case lua.LUA_TLIGHTUSERDATA: {
      if (lua.lua_touserdata(state, index) === jsonNull) return null;
      throw new TypeError("Unsupported Lua userdata in JSON mock.");
    }
    case lua.LUA_TTABLE: {
      const absolute = lua.lua_absindex(state, index);
      const identity = lua.lua_topointer(state, absolute);
      if (seen.has(identity)) throw new TypeError("Cyclic Lua table in JSON mock.");
      seen.add(identity);
      const entries: [string | number, unknown][] = [];
      lua.lua_pushnil(state);
      while (lua.lua_next(state, absolute)) {
        const key = read(state, -2, seen);
        if (typeof key !== "string" && typeof key !== "number") {
          throw new TypeError("Unsupported Lua JSON key.");
        }
        entries.push([key, read(state, -1, seen)]);
        lua.lua_pop(state, 1);
      }
      seen.delete(identity);
      // Like Redis cjson, an empty Lua table encodes as an object. Array
      // metadata is not retained by cjson.decode; nonempty dense arrays are.
      if (entries.length && entries.every(([key]) =>
        typeof key === "number" && Number.isInteger(key) && key >= 1 && key <= entries.length)) {
        const array = new Array<unknown>(entries.length);
        for (const [key, value] of entries) array[(key as number) - 1] = value;
        return array;
      }
      return Object.fromEntries(entries);
    }
    default: throw new TypeError("Unsupported Lua value in JSON mock.");
  }
}

function callback(state: LuaState, run: (state: LuaState) => unknown): void {
  lua.lua_pushjsfunction(state, (inner) => {
    let result: unknown;
    try { result = run(inner); }
    catch (error) {
      push(inner, error instanceof Error ? error.message : String(error));
      return lua.lua_error(inner);
    }
    push(inner, result);
    return 1;
  });
}

function evaluate(source: string, keys: readonly string[], args: readonly string[],
  redisCall: (args: readonly string[]) => unknown): unknown {
  const state = lauxlib.luaL_newstate();
  try {
    lualib.luaL_openlibs(state);
    for (const name of ["io", "os", "package", "require", "debug", "fengari", "dofile", "loadfile"]) {
      lua.lua_pushnil(state);
      lua.lua_setglobal(state, to_luastring(name));
    }
    const compatibility = `
      local original_tonumber = tonumber
      tonumber = function(...)
        local value = original_tonumber(...)
        if value == nil then return nil end
        return value + 0.0
      end
      unpack = table.unpack
    `;
    if (lauxlib.luaL_loadstring(state, to_luastring(compatibility)) !== lua.LUA_OK ||
      lua.lua_pcall(state, 0, 0, 0) !== lua.LUA_OK) {
      throw new Error(lua.lua_tojsstring(state, -1) ?? "Mock Lua initialization failed.");
    }
    push(state, keys);
    lua.lua_setglobal(state, to_luastring("KEYS"));
    push(state, args);
    lua.lua_setglobal(state, to_luastring("ARGV"));
    lua.lua_createtable(state, 0, 1);
    callback(state, (inner) => {
      const command = Array.from({ length: lua.lua_gettop(inner) }, (_, index) => {
        const value = read(inner, index + 1);
        if (typeof value !== "string" && typeof value !== "number") {
          throw new TypeError("Redis command arguments must be strings or numbers.");
        }
        return String(value);
      });
      return redisCall(command);
    });
    lua.lua_setfield(state, -2, to_luastring("call"));
    lua.lua_setglobal(state, to_luastring("redis"));
    lua.lua_createtable(state, 0, 3);
    callback(state, (inner) => JSON.parse(String(read(inner, 1))) as unknown);
    lua.lua_setfield(state, -2, to_luastring("decode"));
    callback(state, (inner) => JSON.stringify(read(inner, 1)));
    lua.lua_setfield(state, -2, to_luastring("encode"));
    lua.lua_pushlightuserdata(state, jsonNull);
    lua.lua_setfield(state, -2, to_luastring("null"));
    lua.lua_setglobal(state, to_luastring("cjson"));
    if (lauxlib.luaL_loadstring(state, to_luastring(source)) !== lua.LUA_OK ||
      lua.lua_pcall(state, 0, 1, 0) !== lua.LUA_OK) {
      throw new Error(lua.lua_tojsstring(state, -1) ?? "Mock Redis Lua execution failed.");
    }
    return read(state, -1);
  } finally { lua.lua_close(state); }
}

export interface DeferredCommand {
  /** Resolves when the intercepted command reaches its chosen boundary. */
  readonly entered: Promise<void>;
  release(): void;
}

type Phase = "before" | "after";
interface Interception {
  readonly phase: Phase;
  readonly enter: () => Promise<void>;
}

export class RedisMockClient {
  readonly commands: (readonly string[])[] = [];
  readonly #interceptions: Interception[] = [];

  constructor(readonly server: RedisMockServer) {}

  failNext(phase: Phase, error: Error = new Error(`Mock connection failed ${phase} EVAL.`)): void {
    this.#interceptions.push({ phase, enter: () => Promise.reject(error) });
  }

  deferNext(phase: Phase): DeferredCommand {
    let announce!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { announce = resolve; });
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    this.#interceptions.push({ phase, enter: () => { announce(); return waiting; } });
    return { entered, release };
  }

  async sendCommand(input: readonly string[]): Promise<unknown> {
    const args = [...input];
    this.commands.push(args);
    this.server.commands.push(args);
    const interception = this.#interceptions.shift();
    if (interception?.phase === "before") await interception.enter();
    // No promise or await occurs inside execute: other clients cannot observe
    // an intermediate HSET. A failure after this point loses the reply only.
    const result = this.server.execute(args);
    if (interception?.phase === "after") await interception.enter();
    return result;
  }
}

export class RedisMockServer {
  readonly commands: (readonly string[])[] = [];
  readonly redisCommands: (readonly string[])[] = [];
  readonly #hashes = new Map<string, Map<string, string>>();
  readonly #strings = new Map<string, string>();

  constructor(readonly now: () => number = Date.now) {}

  client(): RedisMockClient { return new RedisMockClient(this); }

  getHash(key: string): ReadonlyMap<string, string> {
    return new Map(this.#hashes.get(key));
  }

  setHashField(key: string, field: string, value: string): void {
    if (this.#strings.has(key)) throw new Error("WRONGTYPE");
    const hash = this.#hashes.get(key) ?? new Map<string, string>();
    hash.set(field, value);
    this.#hashes.set(key, hash);
  }

  setString(key: string, value: string): void {
    this.#hashes.delete(key);
    this.#strings.set(key, value);
  }

  execute(args: readonly string[]): unknown {
    const [command, source, rawCount] = args;
    if (command !== "EVAL" || source === undefined || rawCount === undefined) {
      throw new Error("Mock supports EVAL only.");
    }
    const count = Number(rawCount);
    if (!Number.isSafeInteger(count) || count < 0 || args.length < 3 + count) {
      throw new Error("Invalid EVAL keys.");
    }
    return evaluate(source, args.slice(3, 3 + count), args.slice(3 + count),
      (input) => this.#redisCall(input));
  }

  #redisCall(args: readonly string[]): unknown {
    this.redisCommands.push([...args]);
    const command = args[0]?.toUpperCase();
    const key = args[1];
    if (command === "TIME") {
      const milliseconds = this.now();
      if (!Number.isFinite(milliseconds)) return [String(milliseconds), "0"];
      const seconds = Math.floor(milliseconds / 1000);
      return [String(seconds), String((milliseconds - seconds * 1000) * 1000)];
    }
    if (key === undefined) throw new Error("Missing Redis key.");
    if (command === "TYPE") {
      return { ok: this.#hashes.has(key) ? "hash" : this.#strings.has(key) ? "string" : "none" };
    }
    if (this.#strings.has(key)) throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value.");
    const hash = this.#hashes.get(key);
    switch (command) {
      case "HGET": return hash?.get(args[2]!) ?? false;
      case "HMGET": return args.slice(2).map((field) => hash?.get(field) ?? false);
      case "HSET": {
        if (args.length < 4 || args.length % 2 !== 0) throw new Error("Invalid HSET arguments.");
        let added = 0;
        for (let index = 2; index < args.length; index += 2) {
          const field = args[index]!;
          if (!this.#hashes.get(key)?.has(field)) added++;
          this.setHashField(key, field, args[index + 1]!);
        }
        return added;
      }
      default: throw new Error(`Unsupported mock Redis command: ${command}.`);
    }
  }
}
