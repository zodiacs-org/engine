/** Explicit local source identity capture. No import-time I/O or git dependency. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface EngineSourceIdentity {
  readonly schema: "minorbodies-engine-source-v1";
  readonly packageVersion: string;
  readonly nodeVersion: string;
  readonly files: readonly Readonly<{ path: string; sha256: string }>[];
  readonly sha256: string;
}

const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Hash the evaluator and bridge local import graphs, including type-only imports. */
export async function readEngineSourceIdentity(): Promise<EngineSourceIdentity> {
  const repository = new URL("../../", import.meta.url);
  const seen = new Map<string, string>();
  async function visit(url: URL): Promise<void> {
    if (!url.href.startsWith(repository.href)) throw new Error("Engine source import escaped checkout.");
    const path = url.href.slice(repository.href.length);
    if (seen.has(path)) return;
    const source = await readFile(url, "utf8");
    seen.set(path, hash(source));
    const imports = [...source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)];
    for (const match of imports) await visit(new URL(match[1]!.replace(/\.js$/, ".ts"), url));
  }
  await visit(new URL("./engine-bridge.ts", import.meta.url));
  await visit(new URL("./ephemeris.ts", import.meta.url));
  const packageText = await readFile(new URL("package.json", repository), "utf8");
  seen.set("package.json", hash(packageText));
  const files = Object.freeze([...seen.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([path, sha256]) => Object.freeze({ path, sha256 })));
  const record = { schema: "minorbodies-engine-source-v1" as const,
    packageVersion: (JSON.parse(packageText) as { version: string }).version,
    nodeVersion: process.version, files };
  return Object.freeze({ ...record, sha256: hash(JSON.stringify(record)) });
}
