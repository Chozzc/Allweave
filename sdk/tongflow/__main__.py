"""``python -m tongflow`` command line.

Subcommands::

    python -m tongflow scan   [--root DIR] [--abi FILE]   # plugin registry JSON
    python -m tongflow engine                             # NDJSON workflow runner (stdin)
    python -m tongflow version

For backwards compatibility, invoking without a subcommand behaves like
``scan`` (``python -m tongflow --root plugins --abi ...`` keeps working).
"""

from __future__ import annotations

import sys

from .scan import add_scan_arguments, run_scan

_SUBCOMMANDS = ("scan", "engine", "version")


def main(argv: "list[str] | None" = None) -> int:
    import argparse

    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args[0] not in _SUBCOMMANDS:
        # Legacy form: plain scan flags.
        ap = argparse.ArgumentParser(prog="python -m tongflow")
        add_scan_arguments(ap)
        return run_scan(ap.parse_args(args))

    cmd, rest = args[0], args[1:]
    if cmd == "scan":
        ap = argparse.ArgumentParser(prog="python -m tongflow scan")
        add_scan_arguments(ap)
        return run_scan(ap.parse_args(rest))
    if cmd == "engine":
        from .engine.__main__ import main as engine_main

        return engine_main()
    from . import __version__

    print(__version__)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
