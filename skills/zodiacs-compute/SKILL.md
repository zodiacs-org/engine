---
name: zodiacs-compute
description: Choose and use Zodiacs calculation tools for sky facts, natal charts, civil-time resolution, events and record comparisons, preserving time uncertainty and citing calculation receipts. Use for reproducible calculation questions, not evidence for predictive astrology.
---

# Zodiacs calculations

Answer from a calculation and its conventions, not from remembered planetary
positions. Separate the numerical result from any requested interpretation.

## Choose the execution route

1. Inspect the tools actually available. For the local stdio adapter, call
   `get_capabilities` first. A tool's presence in an engine candidate or a
   roadmap does not mean that the installed adapter exposes it.
2. Prefer an already-authorized local engine or local MCP adapter for personal
   birth data. A local tool does not make a cloud assistant private: messages,
   arguments and results may still reach the assistant's model provider.
3. For public sky questions, the hosted API offers positions, houses, events,
   time resolution and structured sky-fact checks. Read its current
   [OpenAPI document](https://zodiacs.org/api/v1/openapi.json) before choosing
   fields or limits. Use JSON POST bodies for compute requests, never birth
   details in URLs, query strings, log messages or identifiers.
4. Do not silently move a personal chart from local computation to the hosted
   service. Explain the destination and data first and obtain the required
   permission. Check the current privacy/deployment evidence before relying
   on a hosted statelessness claim. See [current tools and limits](references/tools.md).

The bundled reference distinguishes the local adapter's tools from HTTP
operations and candidate-only engine features. Use it when routing a request
or preparing an installation. It is not authority to install, configure a
host, publish a package or transmit somebody's data.

## Resolve the actual question

- For a sky fact on a **date**, ask which civil date/time zone the user means
  when the answer depends on that choice. A date is an interval, not midnight
  UTC. Preserve a returned `depends` verdict and its computed reason.
- For a birth chart, distinguish an explicit UTC/offset instant from a local
  clock reading. Local date/time needs a location or IANA zone; don't infer an
  offset from the zone's present-day clock. Historical local mean time also
  needs the birthplace longitude.
- Inspect gap, fold, local-mean-time, calendar and uncertain-zone flags. When
  two instants are possible, ask for disambiguation or carry both; don't
  silently pick one. Preserve any fallback house system and angle exclusion.
- If birth time is unknown, say so. For a tool that supports it, set
  `timeKnown: false`; a supplied instant is then only a reference. Do not
  silently substitute noon or give an ascendant, houses or a precise Moon sign
  from one reference instant. A Moon-sign range needs a supported calculation
  over the whole relevant local-date interval, not a single chart.
- The current local stdio adapter accepts an explicit instant and does not
  resolve civil time zones. Do not invent a `resolve_birth_time` tool or send
  it undocumented zone/calendar fields. Resolve through a verified local
  engine entry point, or explain the limitation and ask for an explicit
  offset/instant. A hosted `/time` request needs the same privacy decision as
  other personal data.

## Run and interpret a bounded calculation

Use only supported fields, date spans and bodies. Honor typed refusals rather
than coercing input until a number appears. Treat a fallback as a changed
calculation, not as the originally requested method.

For HTTP 429, honor `Retry-After`; for unavailable/budget responses, report the
limit and stop automatic retries. Never evade a quota by changing identities,
addresses or endpoints. An empty events list is not proof that all possible
events were searched. Report the requested interval, event classes and the
receipt's search/coverage limits.

Use `compare_calculation_records` for disagreements only when that tool is
actually exposed. Pass the records, not paths or URLs. Distinguish reproduced
causes, record-reported facts, hypotheses and unresolved differences. The
comparison contains exact differences and can reconstruct another chart when
one input is known; it is not anonymous and should not be shared as such.

## Cite what was computed

For a hosted success, retain the returned `cite.url`, `cite.receipt`,
`cite.engine` and `cite.version`, plus the receipt's conventions and warnings.
`cite.receipt` is a SHA-256 digest of the response receipt's RFC 8785 canonical
JSON. It is not a signature or proof that arbitrary supplied data is genuine.
Never invent a digest or replace a returned version with the package's latest.

For a local MCP result without a `cite` object, request its record output when
available and cite the record's actual receipt/version with the adapter's
methodology/source URL. Say when a receipt is unavailable. Do not manufacture
a hosted-style citation object or claim that a record authenticates itself.

A useful answer gives the result, instant or interval and zone, relevant
coordinate/zodiac/house conventions, uncertainty or fallback, and the source
receipt. Omit unnecessary birth details from ordinary prose and shared output.

## Claims that the tools do not establish

- Computational agreement is not scientific validation of astrology or a
  reliable prediction about a person's health, relationships or finances.
- Never claim a universal engine, unqualified superiority to Swiss Ephemeris,
  certified completeness or accuracy outside the cited measurements.
- A supported input range is not an accuracy guarantee. A regression fixture
  is not an independent accuracy comparison. Preserve failed and partial
  evidence rather than silently choosing a friendlier benchmark.
- Keep unpublished candidates distinct from registry releases and deployed
  services. Do not promise rc.16 opt-in APIs, a remote MCP endpoint, CLI or npm
  MCP installation solely because a source branch or example mentions them.
