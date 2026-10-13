# CodeQL triage

## Alert 37: startup callback classified as a request handler

[CodeQL alert 37](https://github.com/zodiacs-org/engine/security/code-scanning/37)
points to the `onReady` callback in [src/app.ts](src/app.ts). The recommended
disposition is **false positive**: request throttling does not apply to this
startup callback.

Fastify's `onReady` is an application lifecycle hook. It runs during boot,
before the listener accepts requests, including when `ready()` or the first
test injection boots the app. Fastify shares concurrent readiness calls and
does not rerun the hook for subsequent requests. It passes no request or
reply to this async callback. The pinned dependency's
`docs/Reference/Hooks.md` (`onReady`), `fastify.js` (`ready`) and
`lib/hooks.js` (`hookRunnerApplication`) describe and implement that behavior.

The callback calls [verifyEngine()](src/engine.ts), which calculates a natal
chart and creates its receipt from a fixed synthetic instant, then sets
the local readiness flag. No HTTP input controls that calculation. If the
check throws, boot fails and the flag remains false. In the executable,
[src/main.ts](src/main.ts) closes the app and calculation pool and emits a
fixed startup failure message without the raw error.

Keep the explicit `onReady` registration: moving the check into a request
hook would change its lifecycle and moving it out of boot would bypass the
readiness barrier. Actual requests use client admission throttling before
authentication and the per-key limiter. This triage does not apply to those
request handlers or to alert 42's admission gap.

Existing checks in [test/app.vitest.ts](test/app.vitest.ts),
[test/lifecycle.vitest.ts](test/lifecycle.vitest.ts) and
[test/process.vitest.ts](test/process.vitest.ts) cover probe readiness,
shutdown admission and sanitized executable startup failures. This note
records the reasoning for maintainer triage; it does not dismiss the alert
or assert that a subsequent CodeQL scan has passed.

## Alert 39: SHA-256 digest of a random API key

[CodeQL alert 39](https://github.com/zodiacs-org/engine/security/code-scanning/39)
points to SHA-256 in [src/api-keys.ts](src/api-keys.ts). The recommended
disposition is **false positive**, conditional on the key provisioning
requirement below. These digests identify cryptographically random bearer
secrets for comparison. The server has no password registration or password
verification path.

Provision each key from at least 32 bytes produced by a cryptographic random
generator, encoded as unpadded base64url or hex. The generation examples in
[README.md](README.md#api-keys) and [DEPLOYMENT.md](DEPLOYMENT.md) use
`randomBytes(32).toString('base64url')`. Under this assumption the input has
256 bits of entropy, so password stretching is unnecessary for resisting
offline guesses of the original secret from its digest. SHA-256 does not
make a weak or predictable key safe.

The shared token validator rejects strings shorter than 43 characters,
the length of the documented base64url encoding, before hashing configured
keys or presented credentials. This replaces the previous minimum of 32
characters, which allowed shorter random material. Both environment and file
configuration fail startup with sanitized errors for short keys. The server
cannot infer entropy from a string's length or alphabet: operators must never
use passwords, repeated characters, padded short secrets or other predictable
strings, even when they pass validation. Replace existing shorter keys using
the documented generator before restarting.

The store retains only digests and opaque process-local identities and compares
every configured digest using `timingSafeEqual`. Duplicate rejection, bounded
configuration reads and fail-closed authentication remain in place.
[test/api-keys.vitest.ts](test/api-keys.vitest.ts) checks encoding and length
boundaries, short-key rejection through both configuration sources and digest
privacy. [test/auth.vitest.ts](test/auth.vitest.ts) checks short credentials
receive HTTP 401 before handler execution, and
[test/process.vitest.ts](test/process.vitest.ts) checks sanitized startup
failures for short keys in both sources. This note supplies a written reason
for maintainer triage; it does not dismiss the alert or claim a passing scan.
