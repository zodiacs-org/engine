#!/usr/bin/env bash
set -euo pipefail
: "${RUNNER_TEMP:?}"
mkdir -p "$RUNNER_TEMP/jsr-deno"
curl --fail --silent --show-error --location --max-time 120 --output "$RUNNER_TEMP/jsr-deno/deno.zip" https://github.com/denoland/deno/releases/download/v2.6.7/deno-x86_64-unknown-linux-gnu.zip
printf '%s  %s\n' c5626c9ee10e87201706fc5e64ed5a44b31527d98c130f164e149e1477c0a87d "$RUNNER_TEMP/jsr-deno/deno.zip" | sha256sum --check --strict
unzip -q "$RUNNER_TEMP/jsr-deno/deno.zip" -d "$RUNNER_TEMP/jsr-deno"
printf '%s  %s\n' 238a8182c2f22d94eba9868be7bd946c4409dd64f8435d11c628543c7cca177d "$RUNNER_TEMP/jsr-deno/deno" | sha256sum --check --strict
"$RUNNER_TEMP/jsr-deno/deno" --version
