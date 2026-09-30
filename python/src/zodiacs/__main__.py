"""The zodiacs command line entry point."""
import argparse
import json
import sys

from . import Engine, ZodiacsError, __version__


def main() -> int:
    parser = argparse.ArgumentParser(description="Local Zodiacs calculations; requires Node.js")
    parser.add_argument("--version", action="version", version=f"zodiacs {__version__}")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("positions", "moon-phase", "natal-chart"):
        command = commands.add_parser(name)
        command.add_argument("--utc", required=True, help="ISO timestamp with explicit timezone")
        if name == "natal-chart":
            command.add_argument("--latitude", type=float)
            command.add_argument("--longitude", type=float)
            command.add_argument("--house-system", default="whole")
            command.add_argument("--unknown-time", action="store_true")
    args = parser.parse_args()
    engine = Engine()
    try:
        if args.command == "natal-chart":
            birth = {"utc": args.utc, "houseSystem": args.house_system,
                     "timeKnown": not args.unknown_time}
            if args.latitude is not None:
                birth["latitude"] = args.latitude
            if args.longitude is not None:
                birth["longitude"] = args.longitude
            result = engine.natal_chart(birth)
        else:
            result = getattr(engine, args.command.replace("-", "_"))(args.utc)
        print(json.dumps(result, indent=2, allow_nan=False))
    except (ValueError, ZodiacsError):
        print("zodiacs: calculation failed; check the inputs and Node.js installation", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
