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
