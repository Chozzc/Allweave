"""`python -m tongflow` command line: subcommands + legacy scan form."""

from __future__ import annotations

import json
import subprocess
import sys


def _run(*args: str, stdin: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "tongflow", *args],
        input=stdin,
        capture_output=True,
        text=True,
        check=False,
    )


def test_version_subcommand():
    from tongflow import __version__

    res = _run("version")
    assert res.returncode == 0
    assert res.stdout.strip() == __version__


def test_scan_subcommand_uses_bundled_abi(tmp_path):
    # No --abi: the scanner falls back to the ABI bundled with the SDK, so a
    # pip-installed tongflow scans without a repo checkout.
    root = tmp_path / "plugins"
    root.mkdir()
    res = _run("scan", "--root", str(root))
    assert res.returncode == 0, res.stderr
    payload = json.loads(res.stdout)
    assert payload["errors"] == []
    assert payload["plugins"] == {}


def test_legacy_flags_without_subcommand_still_scan(tmp_path):
    root = tmp_path / "plugins"
    root.mkdir()
    res = _run("--root", str(root))
    assert res.returncode == 0, res.stderr
    assert json.loads(res.stdout)["plugins"] == {}


def test_engine_subcommand_emits_ready_line():
    # A malformed request still gets the ready line first, then the error.
    res = _run("engine", stdin='{"workflow": "nope"}')
    lines = [json.loads(line) for line in res.stdout.splitlines() if line.strip()]
    assert lines[0]["ready"]["version"]
    assert "error" in lines[-1]
