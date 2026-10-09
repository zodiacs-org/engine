# Python hosted Compute client — private preparation

This package calls the existing hosted Compute API; calculations happen at the
selected origin. It does not wrap a local engine or change the root engine's
network-free boundary. It requires Python 3.11 or newer and pins httpx 0.28.1.

The distribution is **private preparation**, version 0.0.0, with PyPI's
`Private :: Do Not Upload` classifier and no publishing workflow. Building a
wheel is a consumer check, not registry publication. Stable/package publication
and full affected release-range/staged private searches retain their separate
prerequisites. No private search or clearance is claimed here.

## Use from an installed private wheel

```python
from zodiacs_compute import ComputeClient, ComputeHttpError

client = ComputeClient()
try:
    reply = client.positions({
        "instants": ["2000-01-01T12:00:00Z"],
        "bodies": ["Sun", "Moon"],
    })
    print(reply["backend"]["version"])
except ComputeHttpError as error:
    # Caller decides whether to wait or retry; the client never retries.
    print(error.status, error.retry_after)
```

Use `AsyncComputeClient` and await the same methods in an asyncio application.
Cancel its task to cancel a request. The synchronous facade refuses calls from
an active event loop before creating a coroutine. Methods are `chart`,
`positions`, `houses`, `events`, `time`, `sky_fact` and `elections`.
The overloaded `call` method preserves each endpoint's request/response type.
The `contract` module exports the generated TypedDict and union types.

Each call opens and closes a separate HTTP session, posts JSON, omits
authentication/cookies, ignores environment proxies/credentials, refuses
redirects, requests no storage and retains no shared response cookie jar.
There is no automatic retry, logging or calculation cache. Request origin must
have no credentials, path, query or fragment. A transport factory may supply a
fresh httpx async transport per call; each returned transport is owned and
closed by that call.

The default asyncio deadline is 15 seconds, configurable above zero and at most
60 seconds, and includes the HTTP request and body read. Cancellation cleans up
the HTTP session. This is not a claim about every operating system's DNS
resolver shutdown time. Native loopback tests cover delayed response headers,
a hanging response body and cookie separation across consecutive calls.

HTTP errors carry status, Retry-After and parsed or text response separately
from their fixed exception message. Protocol errors reject malformed JSON or a
wrong/missing response envelope. Transport and timeout errors use fixed
messages. The client checks the schema identity, result presence, receipt,
backend version and cite envelope; it does not perform full JSON Schema
validation. The server owns request validation and compute budgets. TypedDicts
describe JSON lists; length, numeric bounds and string patterns are runtime
server constraints.

## Source and checks

The generator verifies the exact contract digest in
`../typescript/contracts/provenance.json` and derives from its verified
public Compute-only OpenAPI subset. It preserves required properties,
discriminated unions, UTC/local exclusivity and instant/date/zone exclusions.
It never imports the engine's source or downloads a new contract during import.

`node scripts/generate-contract.mjs --check` checks reproducible declarations.
The workflow runs strict source typing, positive and negative consumer
contracts, and synthetic request/error/cancellation checks. It builds a private
wheel and sdist, inspects their boundaries/private marker, installs the wheel
into a new venv outside the checkout, repeats the consumer checks against the
installed modules and records actual package hashes. No installed consumer can
resolve this checkout through PYTHONPATH or MYPYPATH.

The adjacent TypeScript generator also preserves the sky-fact negative
alternatives; its added type controls refuse conflicting instant/date/zone
requests. Every full core/archive/consumer/conformance gate remains required.
Runtime fixture agreement is contract regression, not independent accuracy.
