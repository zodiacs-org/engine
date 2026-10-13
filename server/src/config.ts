export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = typeof LOG_LEVELS[number];

export interface ServerConfig {
  host: string;
  port: number;
  logLevel: LogLevel;
}

export function readConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const host = env.HOST ?? "127.0.0.1";
  const portText = env.PORT ?? "3000";
  const logLevel = env.LOG_LEVEL ?? "info";
  if (host.length === 0 || /\s/u.test(host)) throw new Error("HOST is invalid.");
  if (!/^\d{1,5}$/u.test(portText) || Number(portText) > 65535) throw new Error("PORT is invalid.");
  if (!LOG_LEVELS.some((level) => level === logLevel)) throw new Error("LOG_LEVEL is invalid.");
  return { host, port: Number(portText), logLevel: logLevel as LogLevel };
}
