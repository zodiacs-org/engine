import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import dns from "node:dns";
import { syncBuiltinESMExports } from "node:module";

// CLI subprocess tests must use local files and the runtime's existing tzdb.
// This is a regression guard for Node network APIs, not an OS sandbox.
function denied() {
  throw new Error("Network disabled by geocode CLI test");
}

globalThis.fetch = denied;
http.request = http.get = denied;
https.request = https.get = denied;
net.connect = net.createConnection = net.Socket.prototype.connect = denied;
tls.connect = denied;
dgram.Socket.prototype.send = denied;
dns.lookup = dns.resolve = dns.resolve4 = dns.resolve6 = denied;
dns.promises.lookup = dns.promises.resolve = dns.promises.resolve4 = dns.promises.resolve6 = denied;
syncBuiltinESMExports();
