import { isIP } from "node:net";
import { QUEUE_LIMITS } from "./queue.js";
import type { SubmitOptions } from "./queue.js";
import { queueIdentifier } from "./queue-data.js";
import { SCHEDULER_DEFAULTS } from "./scheduler.js";

export class CliError extends Error {
  constructor(readonly code: string, message: string, readonly exitCode = 1) { super(message); }
}

export const CLI_HELP = `Usage: node .generated/cli.js COMMAND [OPTIONS]

  submit FILE             Submit a job definition; FILE '-' reads UTF-8 stdin.
  status JOB_ID           Print the job snapshot, including committed progress.
  export JOB_ID           Stream committed results as NDJSON to stdout.
  worker                  Process SQLite jobs until SIGINT or SIGTERM.
  serve                   Start workers and the HTTP control API.
  help                    Print this help (also --help or COMMAND --help).

All commands except help:
  --db PATH               SQLite file; default ../.runtime/queue.sqlite beside
                          the built entry's directory. Explicit paths use cwd.
submit:
  --idempotency-key KEY    Recover a submission using the same job and policy.
  --max-attempts N         Failed-attempt budget (see queue RETRY_DEFAULTS).
  --retry-delay-ms N       Fixed delay after a failed attempt, in milliseconds.
export:
  --cursor N              First row to include, at or behind committed progress.
  --follow                Wait for commits until completion or terminal failure.
  --poll-ms N             Wait between result polls, in milliseconds.
worker, serve:
  --workers N             Worker thread capacity (see SCHEDULER_DEFAULTS).
  --lease-ms N            Lease duration, in milliseconds; renewed while running.
  --poll-ms N             Wait between idle queue polls, in milliseconds.
serve:
  --memory                Disposable in-process queue instead of SQLite.
  --host IP               Bind IP address; default 127.0.0.1.
  --port N                Listen port; default 3000; zero assigns a free port.

Use separate tokens for options and values. Unknown or repeated options fail.
submit/status write JSON to stdout; export writes only NDJSON. Service readiness
and fixed error diagnostics go to stderr. Exit codes: 0 success, 1 operational
failure, 2 invalid input/usage, 3 missing job, 4 idempotency conflict. Interrupted
one-shot commands exit 130 (SIGINT) or 143 (SIGTERM); services drain and exit 0.
Exports can end at an unfinished or failed prefix; inspect status separately.
`;

type Command = "submit" | "status" | "export" | "worker" | "serve";
export interface CliOptions {
  command: Command | "help";
  argument?: string;
  db?: string;
  memory: boolean;
  submit: SubmitOptions;
  cursor: number;
  follow: boolean;
  pollMs?: number;
  workers?: number;
  leaseMs?: number;
  host: string;
  port: number;
}

const FLAGS: Record<Command, readonly string[]> = {
  submit: ["db", "idempotency-key", "max-attempts", "retry-delay-ms"],
  status: ["db"],
  export: ["db", "cursor", "follow", "poll-ms"],
  worker: ["db", "workers", "lease-ms", "poll-ms"],
  serve: ["db", "memory", "workers", "lease-ms", "poll-ms", "host", "port"],
};

function usage(): never { throw new CliError("usage", "Invalid command arguments. Use --help for usage.", 2); }

function integer(value: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (/^(0|[1-9]\d*)$/.exec(value)?.[0] !== value) usage();
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) usage();
  return number;
}

/** Capture the entire command before touching input, storage or the network. */
export function parseCliOptions(args: readonly string[]): CliOptions {
  const command = args[0];
  if ((args.length === 1 && (command === "help" || command === "--help"))
    || (args.length === 2 && command && Object.hasOwn(FLAGS, command) && args[1] === "--help")) {
    return { command: "help", memory: false, submit: {}, cursor: 0, follow: false, host: "127.0.0.1", port: 3000 };
  }
  if (!command || !Object.hasOwn(FLAGS, command)) usage();
  const name = command as Command;
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let index = 1; index < args.length; index++) {
    const token = args[index]!;
    if (!token.startsWith("--")) { positional.push(token); continue; }
    const key = token.slice(2);
    if (!FLAGS[name].includes(key) || flags.has(key)) usage();
    if (key === "follow" || key === "memory") { flags.set(key, "true"); continue; }
    const value = args[++index];
    if (!value || value.startsWith("--")) usage();
    flags.set(key, value);
  }
  const needsArgument = ["submit", "status", "export"].includes(name);
  if (positional.length !== (needsArgument ? 1 : 0) || (needsArgument && !positional[0])) usage();
  if (flags.has("db") && flags.has("memory")) usage();
  const db = flags.get("db");
  if (db !== undefined && (db === ":memory:" || db.includes("\0"))) usage();
  if (name === "status" || name === "export") queueIdentifier(positional[0]);
  const key = flags.get("idempotency-key");
  if (key !== undefined && (key.length > QUEUE_LIMITS.maxIdempotencyKeyLength
    || /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.exec(key)?.[0] !== key)) usage();
  const host = flags.get("host") ?? "127.0.0.1";
  if (!isIP(host)) usage();
  return {
    command: name,
    ...(needsArgument ? { argument: positional[0]! } : {}),
    ...(db !== undefined ? { db } : {}),
    memory: flags.has("memory"),
    submit: {
      ...(key !== undefined ? { idempotencyKey: key } : {}),
      retry: {
        ...(flags.has("max-attempts") ? { maxAttempts: integer(flags.get("max-attempts")!, 1, QUEUE_LIMITS.maxAttempts) } : {}),
        ...(flags.has("retry-delay-ms") ? { delayMs: integer(flags.get("retry-delay-ms")!, 0, QUEUE_LIMITS.maxRetryDelayMs) } : {}),
      },
    },
    cursor: flags.has("cursor") ? integer(flags.get("cursor")!, 0) : 0,
    follow: flags.has("follow"),
    ...(flags.has("poll-ms") ? { pollMs: integer(flags.get("poll-ms")!, 1, SCHEDULER_DEFAULTS.maxTimerMs) } : {}),
    ...(flags.has("workers") ? { workers: integer(flags.get("workers")!, 1, SCHEDULER_DEFAULTS.maxWorkers) } : {}),
    ...(flags.has("lease-ms") ? { leaseMs: integer(flags.get("lease-ms")!, 2, SCHEDULER_DEFAULTS.maxTimerMs) } : {}),
    host,
    port: flags.has("port") ? integer(flags.get("port")!, 0, 65_535) : 3000,
  };
}
