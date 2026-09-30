"""Local calculations using the bundled Zodiacs engine and a Node.js runtime."""

from __future__ import annotations

import atexit
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import tempfile
from typing import Any

__version__ = "0.1.0a1"
ENGINE_VERSION = "0.1.1-rc.14"
_PACKAGE = Path(__file__).resolve().parent


class ZodiacsError(RuntimeError):
    """Runtime unavailable, invalid engine input, or calculation failure."""


@lru_cache(maxsize=1)
def _runtime() -> Path:
    """Materialize verified archives once per Python process, without a network."""
    directory = tempfile.TemporaryDirectory(prefix="zodiacs-")
    root = Path(directory.name)
    try:
        manifest = json.loads((_PACKAGE / "_vendor/manifest.json").read_text())
        for item in manifest["archives"]:
            archive = _PACKAGE / "_vendor" / item["file"]
            if hashlib.sha256(archive.read_bytes()).hexdigest() != item["sha256"]:
                raise ZodiacsError("Bundled runtime integrity check failed")
            destination = root / item["destination"]
            with tarfile.open(archive, "r:gz") as source:
                for member in source.getmembers():
                    relative = PurePosixPath(member.name)
                    if (not member.isfile() or relative.parts[0] != "package"
                            or ".." in relative.parts or "\\" in member.name):
                        raise ZodiacsError("Invalid bundled runtime archive")
                    target = destination.joinpath(*relative.parts[1:])
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with source.extractfile(member) as data, target.open("wb") as output:
                        shutil.copyfileobj(data, output)
        shutil.copyfile(_PACKAGE / "bridge.mjs", root / "bridge.mjs")
    except BaseException:
        directory.cleanup()
        raise
    atexit.register(directory.cleanup)
    return root


def _instant(value: str | datetime) -> str:
    if isinstance(value, str):
        # A deliberately narrow ISO grammar avoids host-local time and JS date rollover.
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})", value):
            raise ValueError("Use an ISO timestamp with seconds and an explicit timezone")
        if not value.endswith("Z") and (int(value[-5:-3]) > 23 or int(value[-2:]) > 59):
            raise ValueError("Invalid timezone offset")
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if not isinstance(value, datetime) or value.utcoffset() is None:
        raise ValueError("Use a timezone-aware datetime or ISO timestamp")
    if value.microsecond % 1000:
        raise ValueError("The engine supports millisecond precision; round explicitly")
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _birth(value: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(value, dict) or "utc" not in value:
        raise ValueError("A birth mapping must contain utc")
    allowed = {"utc", "latitude", "longitude", "houseSystem", "timeKnown", "flags", "deltaT"}
    if value.keys() - allowed:
        raise ValueError("Unknown birth option")
    return {**value, "utc": _instant(value["utc"])}


class Engine:
    """A synchronous client. Each calculation starts a separate Node process.

    ``node`` optionally names a Node executable; ``timeout`` is seconds per call.
    Construction and import perform no calculations or downloads.
    """

    def __init__(self, *, node: str = "node", timeout: float = 30):
        if not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("timeout must be finite and positive")
        self.node = node
        self.timeout = timeout

    def _run(self, operation: str, *args: Any) -> Any:
        request = json.dumps({"operation": operation, "args": args}, allow_nan=False)
        executable = shutil.which(self.node)
        if executable is None:
            raise ZodiacsError("Node.js is required: install Node 22.7+ or 20.19+ (20.x)")
        environment = {key: value for key, value in os.environ.items()
                       if key not in {"NODE_OPTIONS", "NODE_PATH"}}
        try:
            version = subprocess.run([executable, "--version"], capture_output=True,
                                     text=True, timeout=self.timeout, env=environment, check=True)
            match = re.fullmatch(r"v(\d+)\.(\d+)\.(\d+)\s*", version.stdout)
            if not match:
                raise ZodiacsError("Cannot determine Node.js version")
            major, minor, _ = map(int, match.groups())
            if not (major == 20 and minor >= 19 or major == 22 and minor >= 7 or major > 22):
                raise ZodiacsError("Unsupported Node.js: use Node 22.7+ or 20.19+ (20.x)")
            runtime = _runtime()
            result = subprocess.run([executable, str(runtime / "bridge.mjs")], input=request,
                                    capture_output=True, text=True, encoding="utf-8",
                                    timeout=self.timeout, env=environment, cwd=runtime)
        except subprocess.TimeoutExpired:
            raise ZodiacsError("Calculation timed out") from None
        except (OSError, subprocess.CalledProcessError):
            raise ZodiacsError("Could not execute Node.js") from None
        try:
            response = json.loads(result.stdout)
        except ValueError:
            raise ZodiacsError("Node.js did not return a calculation result") from None
        if result.returncode or "result" not in response:
            raise ZodiacsError("Engine rejected the calculation inputs")
        return response["result"]

    def positions(self, utc: str | datetime) -> list[dict[str, Any]]:
        return self._run("positions", _instant(utc))

    def natal_chart(self, birth: dict[str, Any]) -> dict[str, Any]:
        return self._run("natal_chart", _birth(birth))

    def moon_phase(self, utc: str | datetime) -> dict[str, Any]:
        return self._run("moon_phase", _instant(utc))

    def transits(self, birth: dict[str, Any], utc: str | datetime) -> dict[str, Any]:
        return self._run("transits", _birth(birth), _instant(utc))

    def synastry(self, first: dict[str, Any], second: dict[str, Any]) -> dict[str, Any]:
        return self._run("synastry", _birth(first), _birth(second))

    def chart_points(self, birth: dict[str, Any]) -> dict[str, Any]:
        return self._run("chart_points", _birth(birth))

    def chart_declinations(self, birth: dict[str, Any]) -> dict[str, Any]:
        return self._run("chart_declinations", _birth(birth))

    def progressed_bodies(self, birth_utc: str | datetime, target_utc: str | datetime) -> list[dict[str, Any]]:
        return self._run("progressed_bodies", _instant(birth_utc), _instant(target_utc))

    def progressed_instant(self, birth_utc: str | datetime, target_utc: str | datetime) -> str:
        return self._run("progressed_instant", _instant(birth_utc), _instant(target_utc))


_default = Engine()
positions = _default.positions
natal_chart = _default.natal_chart
moon_phase = _default.moon_phase
transits = _default.transits
synastry = _default.synastry
chart_points = _default.chart_points
chart_declinations = _default.chart_declinations
progressed_bodies = _default.progressed_bodies
progressed_instant = _default.progressed_instant
