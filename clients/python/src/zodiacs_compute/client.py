"""Hosted Compute API clients. Creating a client does not make a request."""
import asyncio
import json
import math
from collections.abc import Callable, Mapping
from typing import Any, Literal, overload
import httpx
from . import contract as C

class ComputeHttpError(Exception):
    def __init__(self, status: int, retry_after: str | None, response: object) -> None:
        super().__init__("Compute request failed with HTTP " + str(status))
        self.status = status
        self.retry_after = retry_after
        self.response = response

class ComputeProtocolError(Exception):
    def __init__(self) -> None:
        super().__init__("Compute response did not match its documented envelope.")

class ComputeTimeoutError(Exception):
    def __init__(self) -> None:
        super().__init__("Compute request exceeded its configured timeout.")

class ComputeTransportError(Exception):
    def __init__(self) -> None:
        super().__init__("Compute HTTP transport could not complete the request.")

class AsyncComputeClient:
    def __init__(self, *, origin: str = "https://zodiacs.org", timeout: float = 15.0,
                 transport_factory: Callable[[], httpx.AsyncBaseTransport] | None = None) -> None:
        url = httpx.URL(origin)
        if (url.scheme not in ("http", "https") or not url.host or url.userinfo
            or url.raw_path != b"/" or url.query or url.fragment):
            raise ValueError("origin must be an HTTP(S) origin without credentials, path, query or fragment")
        if isinstance(timeout, bool) or not math.isfinite(timeout) or not 0 < timeout <= 60:
            raise ValueError("timeout must be positive and no greater than 60 seconds")
        self._origin = url
        self._timeout = timeout
        self._transport_factory = transport_factory

    @overload
    async def call(self, endpoint: Literal["chart"], request: C.PlaceInstantRequest) -> C.ChartResponse: ...

    @overload
    async def call(self, endpoint: Literal["positions"], request: C.PositionsRequest) -> C.PositionsResponse: ...

    @overload
    async def call(self, endpoint: Literal["houses"], request: C.PlaceInstantRequest) -> C.HousesResponse: ...

    @overload
    async def call(self, endpoint: Literal["events"], request: C.EventsRequest) -> C.EventsResponse: ...

    @overload
    async def call(self, endpoint: Literal["time"], request: C.TimeRequest) -> C.TimeResponse: ...

    @overload
    async def call(self, endpoint: Literal["sky-fact"], request: C.SkyFactRequest) -> C.SkyFactResponse: ...

    @overload
    async def call(self, endpoint: Literal["elections"], request: C.ElectionsRequest) -> C.ElectionsResponse: ...

    async def call(self, endpoint: str, request: Mapping[str, object]) -> Any:
        if endpoint not in C.RESPONSE_SCHEMAS:
            raise ValueError("Unknown Compute API endpoint")
        if not isinstance(request, Mapping):
            raise TypeError("Compute request must be an object")
        # Serialize before opening a connection. JSON forbids NaN and infinities.
        body = json.dumps(dict(request), allow_nan=False, ensure_ascii=False).encode("utf-8")
        try:
            async with asyncio.timeout(self._timeout):
                # One session per call: no retained response cookies or input state.
                async with httpx.AsyncClient(transport=self._transport_factory() if self._transport_factory else None, trust_env=False,
                                             follow_redirects=False, timeout=None) as session:
                    response = await session.post(
                        self._origin.join("/api/v1/" + endpoint), content=body,
                        headers={"Content-Type": "application/json", "Accept": "application/json",
                                 "Cache-Control": "no-store"})
                    try:
                        payload = response.json()
                    except (ValueError, UnicodeError):
                        if 200 <= response.status_code < 300:
                            raise ComputeProtocolError() from None
                        payload = response.text
                    if not 200 <= response.status_code < 300:
                        raise ComputeHttpError(response.status_code, response.headers.get("Retry-After"), payload)
                    if (not isinstance(payload, dict) or payload.get("schema") != C.RESPONSE_SCHEMAS[endpoint]
                        or "result" not in payload or not isinstance(payload.get("receipt"), dict)
                        or not isinstance(payload.get("backend"), dict)
                        or not isinstance(payload["backend"].get("version"), str)
                        or not isinstance(payload.get("cite"), dict)):
                        raise ComputeProtocolError()
                    return payload
        except TimeoutError:
            raise ComputeTimeoutError() from None
        except httpx.HTTPError:
            raise ComputeTransportError() from None

    async def chart(self, request: C.PlaceInstantRequest) -> C.ChartResponse:
        return await self.call("chart", request)

    async def positions(self, request: C.PositionsRequest) -> C.PositionsResponse:
        return await self.call("positions", request)

    async def houses(self, request: C.PlaceInstantRequest) -> C.HousesResponse:
        return await self.call("houses", request)

    async def events(self, request: C.EventsRequest) -> C.EventsResponse:
        return await self.call("events", request)

    async def time(self, request: C.TimeRequest) -> C.TimeResponse:
        return await self.call("time", request)

    async def sky_fact(self, request: C.SkyFactRequest) -> C.SkyFactResponse:
        return await self.call("sky-fact", request)

    async def elections(self, request: C.ElectionsRequest) -> C.ElectionsResponse:
        return await self.call("elections", request)

class ComputeClient:
    """Synchronous facade; use AsyncComputeClient inside an active event loop."""
    def __init__(self, *, origin: str = "https://zodiacs.org", timeout: float = 15.0,
                 transport_factory: Callable[[], httpx.AsyncBaseTransport] | None = None) -> None:
        self._async = AsyncComputeClient(origin=origin, timeout=timeout, transport_factory=transport_factory)

    @overload
    def call(self, endpoint: Literal["chart"], request: C.PlaceInstantRequest) -> C.ChartResponse: ...

    @overload
    def call(self, endpoint: Literal["positions"], request: C.PositionsRequest) -> C.PositionsResponse: ...

    @overload
    def call(self, endpoint: Literal["houses"], request: C.PlaceInstantRequest) -> C.HousesResponse: ...

    @overload
    def call(self, endpoint: Literal["events"], request: C.EventsRequest) -> C.EventsResponse: ...

    @overload
    def call(self, endpoint: Literal["time"], request: C.TimeRequest) -> C.TimeResponse: ...

    @overload
    def call(self, endpoint: Literal["sky-fact"], request: C.SkyFactRequest) -> C.SkyFactResponse: ...

    @overload
    def call(self, endpoint: Literal["elections"], request: C.ElectionsRequest) -> C.ElectionsResponse: ...

    def call(self, endpoint: str, request: Mapping[str, object]) -> Any:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            pass
        else:
            raise RuntimeError("Use AsyncComputeClient inside an active event loop")
        return asyncio.run(self._async.call(endpoint, request))  # type: ignore[call-overload]

    def chart(self, request: C.PlaceInstantRequest) -> C.ChartResponse:
        return self.call("chart", request)

    def positions(self, request: C.PositionsRequest) -> C.PositionsResponse:
        return self.call("positions", request)

    def houses(self, request: C.PlaceInstantRequest) -> C.HousesResponse:
        return self.call("houses", request)

    def events(self, request: C.EventsRequest) -> C.EventsResponse:
        return self.call("events", request)

    def time(self, request: C.TimeRequest) -> C.TimeResponse:
        return self.call("time", request)

    def sky_fact(self, request: C.SkyFactRequest) -> C.SkyFactResponse:
        return self.call("sky-fact", request)

    def elections(self, request: C.ElectionsRequest) -> C.ElectionsResponse:
        return self.call("elections", request)
