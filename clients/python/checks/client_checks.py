import asyncio
import copy
import json
from pathlib import Path
import time
import unittest
import httpx
from zodiacs_compute import (
    AsyncComputeClient, ComputeClient, ComputeHttpError, ComputeProtocolError,
    ComputeTimeoutError, ComputeTransportError)
FIXTURES = json.loads(Path(__file__).with_name("fixtures.json").read_text())
SAMPLE = FIXTURES["operations"]["positions"]
def client(handler, **options):
    return AsyncComputeClient(transport_factory=lambda: httpx.MockTransport(handler), **options)

class RuntimeChecks(unittest.IsolatedAsyncioTestCase):
    async def test_http_post_and_exact_fixture_envelope(self):
        for endpoint, fixture in FIXTURES["operations"].items():
            calls = []
            def respond(request):
                calls.append(request)
                self.assertEqual(request.method, "POST")
                self.assertEqual(request.url.path, "/api/v1/" + endpoint)
                self.assertEqual(json.loads(request.content), fixture["request"])
                self.assertEqual(request.headers["content-type"], "application/json")
                self.assertEqual(request.headers["accept"], "application/json")
                self.assertEqual(request.headers["cache-control"], "no-store")
                self.assertNotIn("cookie", request.headers)
                self.assertNotIn("authorization", request.headers)
                return httpx.Response(200, json=fixture["response"])
            with self.subTest(endpoint=endpoint):
                result = await getattr(client(respond), fixture["method"])(fixture["request"])
                self.assertEqual(result, fixture["response"])
                self.assertEqual(len(calls), 1)

    async def test_every_documented_http_failure_without_retry(self):
        for code, payload in FIXTURES["errors"].items():
            calls = []
            def respond(request):
                calls.append(request)
                return httpx.Response(int(code), json=payload, headers={"Retry-After": "60"})
            with self.subTest(status=code):
                with self.assertRaises(ComputeHttpError) as caught:
                    await client(respond).positions(SAMPLE["request"])
                error = caught.exception
                self.assertEqual(error.status, int(code))
                self.assertEqual(error.retry_after, "60")
                self.assertEqual(error.response, payload)
                self.assertEqual(str(error), "Compute request failed with HTTP " + code)
                self.assertEqual(len(calls), 1)

    async def test_text_http_error_keeps_payload_separate(self):
        with self.assertRaises(ComputeHttpError) as caught:
            await client(lambda _: httpx.Response(503, text="synthetic-sensitive-marker")).positions(SAMPLE["request"])
        self.assertEqual(caught.exception.response, "synthetic-sensitive-marker")
        self.assertNotIn("synthetic-sensitive-marker", str(caught.exception))
        self.assertIsNone(caught.exception.retry_after)

    async def test_invalid_success_envelopes(self):
        candidates = [None, [], {}, {"schema": "other"}]
        for key, replacement in [("schema", "other"), ("receipt", []), ("backend", []), ("cite", []), ("backend", {"version": 2})]:
            payload = copy.deepcopy(SAMPLE["response"]); payload[key] = replacement; candidates.append(payload)
        missing = copy.deepcopy(SAMPLE["response"]); del missing["result"]; candidates.append(missing)
        for payload in candidates:
            with self.subTest(payload=payload):
                with self.assertRaises(ComputeProtocolError):
                    await client(lambda _: httpx.Response(200, json=payload)).positions(SAMPLE["request"])

    async def test_non_json_success(self):
        with self.assertRaises(ComputeProtocolError):
            await client(lambda _: httpx.Response(200, text="not JSON")).positions(SAMPLE["request"])

    async def test_redirect_is_not_followed(self):
        calls = []
        def respond(request):
            calls.append(request)
            return httpx.Response(307, headers={"Location": "https://other.invalid/collect"})
        with self.assertRaises(ComputeHttpError) as caught:
            await client(respond).positions(SAMPLE["request"])
        self.assertEqual(caught.exception.status, 307)
        self.assertEqual(len(calls), 1)

    async def test_transport_error_message_does_not_echo_request(self):
        def respond(request):
            raise httpx.ConnectError("synthetic-sensitive-marker", request=request)
        with self.assertRaises(ComputeTransportError) as caught:
            await client(respond).positions(SAMPLE["request"])
        self.assertNotIn("synthetic-sensitive-marker", str(caught.exception))
        self.assertTrue(caught.exception.__suppress_context__)

    async def test_unknown_endpoint_never_opens_transport(self):
        opened = []
        def factory():
            opened.append(True); return httpx.MockTransport(lambda _: httpx.Response(500))
        c = AsyncComputeClient(transport_factory=factory)
        with self.assertRaises(ValueError):
            await c.call("unknown", {})
        self.assertEqual(opened, [])

    async def test_non_object_and_non_json_requests_never_open_transport(self):
        opened = []
        def factory():
            opened.append(True); return httpx.MockTransport(lambda _: httpx.Response(500))
        c = AsyncComputeClient(transport_factory=factory)
        for payload in [None, [], 1, {"value": float("nan")}, {"value": object()}]:
            with self.subTest(payload=type(payload).__name__):
                with self.assertRaises((TypeError, ValueError)):
                    await c.positions(payload)
        self.assertEqual(opened, [])

    async def test_total_timeout_on_waiting_transport(self):
        closed = []
        async def respond(request):
            try: await asyncio.sleep(10)
            finally: closed.append(True)
            return httpx.Response(200, json=SAMPLE["response"])
        began = time.monotonic()
        with self.assertRaises(ComputeTimeoutError):
            await client(respond, timeout=0.05).positions(SAMPLE["request"])
        self.assertLess(time.monotonic()-began, 1)
        self.assertEqual(closed, [True])

    async def test_caller_cancellation_propagates_and_closes(self):
        started = asyncio.Event(); closed = []
        async def respond(request):
            started.set()
            try: await asyncio.sleep(10)
            finally: closed.append(True)
            return httpx.Response(200, json=SAMPLE["response"])
        task = asyncio.create_task(client(respond).positions(SAMPLE["request"]))
        await asyncio.wait_for(started.wait(), 1); task.cancel()
        with self.assertRaises(asyncio.CancelledError): await task
        self.assertEqual(closed, [True])

    async def native_timeout(self, partial_body):
        handlers = set()
        async def serve(reader, writer):
            handlers.add(asyncio.current_task())
            try:
                header = await reader.readuntil(b"\r\n\r\n")
                length = next(int(line.split(b":",1)[1]) for line in header.split(b"\r\n") if line.lower().startswith(b"content-length:"))
                await reader.readexactly(length)
                if partial_body:
                    writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{")
                    await writer.drain()
                await reader.read()
            finally:
                writer.close(); await writer.wait_closed()
                handlers.discard(asyncio.current_task())
        server = await asyncio.start_server(serve, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        began = time.monotonic()
        try:
            with self.assertRaises(ComputeTimeoutError):
                await AsyncComputeClient(origin="http://127.0.0.1:"+str(port), timeout=0.15).positions(SAMPLE["request"])
            self.assertLess(time.monotonic()-began, 2)
        finally:
            server.close(); await server.wait_closed()
            for task in list(handlers): task.cancel()
            if handlers: await asyncio.gather(*handlers, return_exceptions=True)

    async def test_native_socket_timeout_before_response_headers(self):
        await self.native_timeout(False)

    async def test_native_socket_timeout_during_response_body(self):
        await self.native_timeout(True)

    async def test_native_two_calls_do_not_retain_cookies(self):
        seen = []; handlers = set()
        async def serve(reader, writer):
            handlers.add(asyncio.current_task())
            try:
                header = await reader.readuntil(b"\r\n\r\n")
                length = next(int(line.split(b":",1)[1]) for line in header.split(b"\r\n") if line.lower().startswith(b"content-length:"))
                body = await reader.readexactly(length); seen.append((header.lower(), json.loads(body)))
                content = json.dumps(SAMPLE["response"]).encode()
                writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nSet-Cookie: retained=no\r\nConnection: close\r\nContent-Length: "+str(len(content)).encode()+b"\r\n\r\n"+content)
                await writer.drain()
            finally:
                writer.close(); await writer.wait_closed(); handlers.discard(asyncio.current_task())
        server = await asyncio.start_server(serve, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        try:
            c = AsyncComputeClient(origin="http://127.0.0.1:"+str(port))
            self.assertEqual(await c.positions(SAMPLE["request"]), SAMPLE["response"])
            self.assertEqual(await c.positions(SAMPLE["request"]), SAMPLE["response"])
            self.assertEqual(len(seen), 2)
            for header, body in seen:
                self.assertNotIn(b"\r\ncookie:", header)
                self.assertNotIn(b"\r\nauthorization:", header)
                self.assertEqual(body, SAMPLE["request"])
        finally:
            server.close(); await server.wait_closed()
            if handlers: await asyncio.gather(*handlers, return_exceptions=True)

    async def test_sync_facade_refuses_active_loop_before_creating_coroutine(self):
        with self.assertRaisesRegex(RuntimeError, "Use AsyncComputeClient"):
            ComputeClient().positions(SAMPLE["request"])

class SyncChecks(unittest.TestCase):
    def test_sync_methods_preserve_each_endpoint(self):
        for endpoint, fixture in FIXTURES["operations"].items():
            with self.subTest(endpoint=endpoint):
                c = ComputeClient(transport_factory=lambda: httpx.MockTransport(lambda _: httpx.Response(200, json=fixture["response"])))
                self.assertEqual(getattr(c,fixture["method"])(fixture["request"]),fixture["response"])
    def test_invalid_origins_and_timeout_bounds(self):
        for origin in ["ftp://host.invalid", "https://user:pass@host.invalid", "https://host.invalid/path", "https://host.invalid/?query", "https://host.invalid/#fragment", "https://"]:
            with self.subTest(origin=origin):
                with self.assertRaises((ValueError, httpx.InvalidURL)): AsyncComputeClient(origin=origin)
        for timeout in [0, -1, 61, float("inf"), float("nan"), True]:
            with self.subTest(timeout=timeout):
                with self.assertRaises(ValueError): AsyncComputeClient(timeout=timeout)
