import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bindWasmBuild } from "./wasm-build.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const cargoHome = join(root, ".cache", "cargo");
const localRustup = join(root, ".tools", "rustup");
const cliRoot = join(root, ".tools", "wasm-bindgen");
const suffix = process.platform === "win32" ? ".exe" : "";
const cli = join(cliRoot, "bin", `wasm-bindgen${suffix}`);
const manifest = readFileSync(join(root, "Cargo.toml"), "utf8");
const version = manifest.match(/^wasm-bindgen\s*=\s*"=([^"]+)"/m)?.[1];
if (!version) throw new Error("Cargo.toml must pin wasm-bindgen to an exact version.");
const toolchain = readFileSync(join(root, "rust-toolchain.toml"), "utf8").match(/^channel\s*=\s*"([^"]+)"/m)?.[1];
if (!toolchain) throw new Error("rust-toolchain.toml must pin a channel.");

const env = {
  ...process.env,
  CARGO_HOME: cargoHome,
  RUSTUP_HOME: localRustup,
  RUSTUP_TOOLCHAIN: toolchain,
  CARGO_TARGET_DIR: join(root, "target"),
  PATH: [join(cargoHome, "bin"), process.env.PATH ?? ""].join(delimiter)
};
mkdirSync(cargoHome, { recursive: true });

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root, env, encoding: "utf8", stdio: capture ? "pipe" : "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture) process.stderr.write(result.stderr ?? "");
    throw new Error(`${command} failed (${result.signal ?? result.status}).`);
  }
  return result.stdout?.trim();
}

function cargo(args) {
  // A system Cargo may precede rustup's proxy on PATH. Always select the pin.
  return run("rustup", ["run", toolchain, "cargo", ...args]);
}

switch (process.argv[2]) {
  case "setup:wasm":
    run("rustup", ["toolchain", "install", toolchain, "--profile", "minimal",
      "--component", "rustfmt,clippy", "--target", "wasm32-unknown-unknown", "--no-self-update"]);
    cargo(["install", "wasm-bindgen-cli", "--version", version, "--locked", "--root", cliRoot]);
    break;
  case "build:native":
    cargo(["build", "--locked", "--release", "-p", "zodiacs-rustcore"]);
    break;
  case "build:wasm":
    if (!existsSync(cli)) throw new Error("Run npm run setup:wasm before building WASM.");
    if (run(cli, ["--version"], true) !== `wasm-bindgen ${version}`) {
      throw new Error("The local wasm-bindgen CLI does not match Cargo.toml; run npm run setup:wasm.");
    }
    run(process.execPath, [join(root, "scripts", "generate-time-data.mjs"), "--typescript"]);
    cargo(["build", "--locked", "--release", "--target", "wasm32-unknown-unknown", "-p", "zodiacs-rustcore-wasm"]);
    run(cli, [join(root, "target", "wasm32-unknown-unknown", "release", "zodiacs_rustcore_wasm.wasm"),
      "--target", "web", "--out-dir", join(root, "pkg"), "--out-name", "zodiacs_rustcore"]);
    {
      const wasmFile = join(root, "pkg", "zodiacs_rustcore_bg.wasm");
      const bound = bindWasmBuild(readFileSync(wasmFile), readFileSync(join(root, "pkg", "zodiacs_rustcore.js")));
      writeFileSync(wasmFile, bound.bytes);
      writeFileSync(join(root, "generated", "wasm-build.ts"), bound.source);
    }
    break;
  case "test:native":
    cargo(["test", "--locked", "--workspace"]);
    break;
  case "lint:rust":
    cargo(["fmt", "--all", "--", "--check"]);
    cargo(["clippy", "--locked", "--workspace", "--all-targets", "--", "-D", "warnings"]);
    break;
  default:
    throw new Error("Expected setup:wasm, build:native, build:wasm, test:native or lint:rust.");
}
