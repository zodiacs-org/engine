import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Runtime-only test certificate and private key. No credential fixture is committed. */
export function testCertificate(): { cert: Buffer; key: Buffer; raw: Buffer } {
  mkdirSync(".cache/tls", { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(".cache/tls/receiver-");
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
      "-subj", "/CN=receiver.example", "-addext", "subjectAltName=DNS:receiver.example,IP:8.8.8.8,IP:2606:4700:4700::1111",
      "-keyout", join(directory, "key.pem"), "-out", join(directory, "cert.pem")], { stdio: "ignore", timeout: 10000 });
    const cert = readFileSync(join(directory, "cert.pem"));
    return { cert, key: readFileSync(join(directory, "key.pem")), raw: new X509Certificate(cert).raw };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
