import { lstatSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { StorageError, STORAGE_LIMITS, WebhookStore } from "./storage.js";

export class ReplayCliError extends Error {
  constructor() { super("Invalid webhook replay command."); this.name = "ReplayCliError"; }
}

type Selection = { readonly eventId: string };
type Listing = { readonly afterId?: string; readonly limit?: number };
export type ReplayCommand =
  | { readonly kind: "help" }
  | ({ readonly kind: "list"; readonly database: string } & Listing)
  | ({ readonly kind: "inspect"; readonly database: string } & Selection)
  | ({ readonly kind: "history"; readonly database: string } & Selection & Listing)
  | ({ readonly kind: "requeue"; readonly database: string; readonly expectedAttemptNumber: number;
      readonly requestId: string; readonly apply: boolean } & Selection);

function invalid(): never { throw new ReplayCliError(); }
function id(value: string | undefined): string {
  if (value === undefined || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/u.test(value)) invalid();
  return value;
}
function integer(value: string | undefined, cap = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined || !/^[1-9][0-9]*$/u.test(value)) invalid();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > cap) invalid();
  return parsed;
}

/** No implicit bulk selection, shell evaluation, permissive numeric parsing or echoed input. */
export function parseReplayCommand(argv: readonly string[]): ReplayCommand {
  if (!Array.isArray(argv) || argv.some(value => typeof value !== "string")
    || Buffer.byteLength(argv.join("\0"), "utf8") > 8192) invalid();
  if (argv.length === 1 && (argv[0] === "help" || argv[0] === "--help")) return { kind: "help" };
  const kind = argv[0];
  if (kind !== "list" && kind !== "inspect" && kind !== "history" && kind !== "requeue") invalid();
  const allowed = new Set(["--db", ...(kind === "list" || kind === "history" ? ["--after", "--limit"] : []),
    ...(kind !== "list" ? ["--event"] : []),
    ...(kind === "requeue" ? ["--attempt", "--request", "--apply", "--dry-run"] : [])]);
  const flags = new Map<string, string>();
  for (let index = 1; index < argv.length; index++) {
    const flag = argv[index]!;
    if (!allowed.has(flag) || flags.has(flag)) invalid();
    if (flag === "--apply" || flag === "--dry-run") flags.set(flag, "true");
    else {
      const value = argv[++index];
      if (!value || value.startsWith("--") || value.includes("\0")) invalid();
      flags.set(flag, value);
    }
  }
  const database = flags.get("--db");
  if (!database || Buffer.byteLength(database, "utf8") > 4096) invalid();
  if (kind === "requeue") {
    if (flags.has("--apply") && flags.has("--dry-run")) invalid();
    return { kind, database, eventId: id(flags.get("--event")),
      expectedAttemptNumber: integer(flags.get("--attempt")), requestId: id(flags.get("--request")),
      apply: flags.has("--apply") };
  }
  const listing: Listing = {
    ...(flags.has("--after") ? { afterId: id(flags.get("--after")) } : {}),
    ...(flags.has("--limit") ? { limit: integer(flags.get("--limit"), STORAGE_LIMITS.maxPageSize) } : {}),
  };
  if (kind === "list") return { kind, database, ...listing };
  const eventId = id(flags.get("--event"));
  return kind === "inspect" ? { kind, database, eventId } : { kind, database, eventId, ...listing };
}

const HELP = {
  usage: [
    "list --db PATH [--after EVENT_ID] [--limit RECORDS]",
    "inspect --db PATH --event EVENT_ID",
    "history --db PATH --event EVENT_ID [--after REQUEST_ID] [--limit RECORDS]",
    "requeue --db PATH --event EVENT_ID --attempt FAILED_ATTEMPT --request REQUEST_ID [--dry-run | --apply]",
  ],
  default: "Requeue previews only. --apply saves a replay and queues delivery; the delivery worker sends later.",
};

export interface ReplayCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Local administration only. Opens an existing DB and never resolves or calls a callback URL. */
export function runReplayCli(argv: readonly string[], now: () => number = Date.now): ReplayCliResult {
  let store: WebhookStore | undefined;
  try {
    const command = parseReplayCommand(argv);
    if (command.kind === "help") return { exitCode: 0, stdout: JSON.stringify(HELP) + "\n", stderr: "" };
    try {
      if (!lstatSync(command.database).isFile()) throw new Error();
    } catch { throw new StorageError("storage-failure"); }
    store = new WebhookStore(command.database, { readOnly: command.kind !== "requeue" || !command.apply });
    let output: unknown;
    if (command.kind === "list" || command.kind === "history") {
      if (command.kind === "history" && !store.getDeliveryLog(command.eventId)) throw new StorageError("not-found");
      const page = { ...(command.afterId !== undefined ? { afterId: command.afterId } : {}),
        ...(command.limit !== undefined ? { limit: command.limit } : {}) };
      const items = command.kind === "list" ? store.listDeadLetters(page) : store.listReplays(command.eventId, page);
      const last = items.at(-1);
      output = { items, nextAfter: items.length === (command.limit ?? STORAGE_LIMITS.defaultPageSize)
        && last ? ("requestId" in last ? last.requestId : last.eventId) : null };
    } else if (command.kind === "inspect") {
      const delivery = store.getDeliveryLog(command.eventId);
      if (!delivery) throw new StorageError("not-found");
      output = { delivery, deadLetter: store.getDeadLetter(command.eventId) ?? null };
    } else {
      const input = { eventId: command.eventId, requestId: command.requestId,
        expectedAttemptNumber: command.expectedAttemptNumber, now: now() };
      const result = command.apply ? store.replayDeadLetter(input) : store.previewReplay(input);
      output = { mode: command.apply ? "applied" : "dry-run", ...result };
    }
    store.close(); store = undefined;
    return { exitCode: 0, stdout: JSON.stringify(output) + "\n", stderr: "" };
  } catch (error) {
    let code = "service-unavailable";
    let exitCode = 1;
    if (error instanceof ReplayCliError || (error instanceof StorageError && error.code === "invalid-input")) {
      code = "invalid-command"; exitCode = 2;
    } else if (error instanceof StorageError && error.code === "not-found") {
      code = "not-found"; exitCode = 3;
    } else if (error instanceof StorageError && error.code === "conflict") {
      code = "replay-conflict"; exitCode = 4;
    }
    return { exitCode, stdout: "", stderr: JSON.stringify({ error: { code } }) + "\n" };
  } finally {
    try { store?.close(); } catch { /* Preserve the fixed diagnostic. */ }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const result = major === 22 && minor! >= 13 ? runReplayCli(process.argv.slice(2))
    : { exitCode: 1, stdout: "", stderr: '{"error":{"code":"unsupported-runtime"}}\n' };
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
