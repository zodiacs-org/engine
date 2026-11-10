import { randomBytes } from "node:crypto";
import { request, type IncomingHttpHeaders, type OutgoingHttpHeaders, type Server } from "node:http";
import { connect, type Socket } from "node:net";
import { createControlServer, type ControlApiOptions } from "../src/control-api.js";
import { deliveryFixture, NOW } from "./delivery-fixture.js";

export async function controlFixture(policy: ControlApiOptions["policy"] = {}) {
  const fixture = deliveryFixture();
  const token = randomBytes(32);
  let now = NOW + 200;
  const servers: Server[] = [];
  async function start(overrides: Partial<ControlApiOptions> = {}) {
    const server = createControlServer({ store: fixture.store, vault: fixture.vault,
      bearerToken: token, policy, now: () => now, ...overrides });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing control address.");
    return { server, port: address.port };
  }
  const { server, port } = await start();
  const auth = `Bearer ${token.toString("base64url")}`;
  const call = (method: string, path: string, input?: unknown,
    headers: OutgoingHttpHeaders = {}, authenticated = true, targetPort = port) => new Promise<{
      status: number; headers: IncomingHttpHeaders; body: string; json: Record<string, unknown>;
    }>((resolve, reject) => {
      const body = input === undefined ? undefined : Buffer.isBuffer(input) ? input : Buffer.from(JSON.stringify(input));
      const req = request({ hostname: "127.0.0.1", port: targetPort, method, path, agent: false,
        headers: { ...(authenticated ? { authorization: auth } : {}),
          ...(body ? { "content-type": "application/json", "content-length": body.length } : {}), ...headers },
      }, res => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode!, headers: res.headers, body, json: JSON.parse(body) as Record<string, unknown> });
        });
        res.on("error", reject);
      });
      req.setTimeout(3000, () => req.destroy(new Error("Loopback control call stalled.")));
      req.on("error", reject); req.end(body);
    });
  const raw = (initial: string, extra?: (socket: Socket) => void) => new Promise<string>((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    let response = "";
    socket.setTimeout(3000, () => socket.destroy(new Error("Loopback raw request stalled.")));
    socket.on("connect", () => { socket.write(initial); extra?.(socket); });
    socket.on("data", chunk => { response += chunk.toString(); });
    socket.on("end", () => resolve(response)); socket.on("error", reject);
  });
  return { ...fixture, server, port, token, auth, call, raw, start, setNow: (value: number) => { now = value; },
    cleanup: async () => {
      for (const server of servers) {
        if (!server.listening) continue;
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
      token.fill(0); fixture.cleanup();
    },
  };
}
