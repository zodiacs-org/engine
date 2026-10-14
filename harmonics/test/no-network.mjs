// Child-process CLI checks run with this preload to make accidental network use fail.
import { syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import dns from "node:dns";

const refused = () => { throw new Error("CLI integration tests forbid network access."); };
globalThis.fetch = refused;
http.get = http.request = https.get = https.request = refused;
net.connect = net.createConnection = net.Socket.prototype.connect = tls.connect = refused;
dgram.createSocket = refused;
dns.lookup = dns.resolve = refused;
dns.promises.lookup = dns.promises.resolve = refused;
syncBuiltinESMExports();
