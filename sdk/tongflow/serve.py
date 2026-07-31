"""Cloud single-slot execution wrapper (backend-neutral).

In the cloud, a `@deploy` plugin can serve one ABI slot invocation directly
from its own container over HTTP, with no generic executor in front of it.
The plugin exposes a thin backend endpoint (e.g. Modal's
`@modal.fastapi_endpoint`) that just forwards to :func:`serve_slot`; this
module keeps all the ABI/asset logic and never imports any backend.

Contract — the caller (Worker / orchestrator) POSTs::

    {
      "nodeSlot": "image-gen",
      "method": "image_gen",            # the @node_slot method on the handler
      "input": { ...ABI fields, assets as file_key refs... },
      "assetEndpoint": "https://app.../api/engine-assets",
      "assetToken": "<per-run signed token>",
      "_tongflow": { "progressUrl": "...", "token": "..." }   # optional
    }

:func:`serve_slot` materialises input asset refs into bytes (via HttpStore),
runs the slot method **in-process** through the caller-supplied ``invoke``
(so this file stays backend-neutral — the backend endpoint owns the local
call, e.g. Modal's ``self.method.local(...)``), then converts returned asset
bytes back into refs. The `_tongflow` key rides into the method so
`@node_slot` installs the progress sink.
"""

from __future__ import annotations

import json
import queue
import threading
import urllib.request
from typing import Any, Callable, Iterator

from .engine.abi_schema import load_abi_schema, resolve_abi_path
from .engine.assets import (
    convert_asset_outputs_to_file_refs,
    materialize_asset_inputs,
)
from .engine.store import HttpStore
from .progress import set_progress_sink

# invoke(method_name, input_dict) -> raw ABI dict. The backend endpoint passes
# a closure that runs the slot locally in this same container.
InvokeFn = Callable[[str, dict[str, Any]], Any]


def serve_slot(payload: dict[str, Any], *, invoke: InvokeFn) -> dict[str, Any]:
    """Run one ABI slot end-to-end inside the plugin's own container."""
    slot = str(payload["nodeSlot"])
    method = str(payload["method"])
    raw_input = payload.get("input")
    inputs_obj = raw_input if isinstance(raw_input, dict) else {}

    abi = load_abi_schema(resolve_abi_path(None))
    store = HttpStore(payload["assetEndpoint"], payload.get("assetToken"))

    materialized = materialize_asset_inputs(slot, inputs_obj, abi, [], store)

    # Ride the progress callback + router model into the slot via @node_slot's
    # reserved keys (popped there before the typed model is built).
    tf = payload.get("_tongflow")
    if tf:
        materialized = {**materialized, "_tongflow": tf}
    model = payload.get("model")
    if model:
        materialized = {**materialized, "_model": model}

    raw = invoke(method, materialized)
    return convert_asset_outputs_to_file_refs(slot, raw, abi, store)


def _post(url: str, body: dict[str, Any]) -> None:
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode(),
            headers={
                "Content-Type": "application/json",
                "User-Agent": "tongflow-plugin/1.0",
            },
            method="POST",
        )
        urllib.request.urlopen(req, timeout=30)  # noqa: S310
    except Exception:  # noqa: BLE001 - reporting must never crash the worker
        pass


def run_and_report(payload: dict[str, Any], *, invoke: InvokeFn) -> None:
    """Background single-node runner: execute the slot, then report the
    terminal state to the Worker callback (``callbackUrl``/``callbackToken``).

    Emits a browser-facing terminal event (``type:"event"``) plus the durable
    DB update (``type:"completed"``/``"failed"``) — mirroring the executor, so
    a plugin serving itself needs no bespoke callback code. A slow slot can run
    past the web-endpoint window because the trigger endpoint only spawns this.
    """
    url = payload["callbackUrl"]
    token = payload["callbackToken"]
    try:
        result = serve_slot(payload, invoke=invoke)
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        _post(url, {"token": token, "type": "event",
                    "event": {"status": "FAILED", "data": {"message": "Task execution failed", "error": msg}}})
        _post(url, {"token": token, "type": "failed", "error": msg})
        return
    _post(url, {"token": token, "type": "event",
                "event": {"status": "COMPLETED", "data": result}})
    _post(url, {"token": token, "type": "completed", "result": result})


def _sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def serve_stream(
    payload: dict[str, Any],
    *,
    invoke: InvokeFn,
    task_id: str = "",
    callback_url: str = "",
    callback_token: str = "",
) -> Iterator[str]:
    """Run one ABI slot in this container and stream progress + result as SSE.

    Single-container, direct-stream path: the caller (browser or Worker) holds
    an ``text/event-stream`` response; the slot runs in a worker thread while
    this generator yields ``RUNNING`` progress events (fed by an in-process
    progress sink), then a terminal ``COMPLETED``/``FAILED`` event carrying the
    output refs. A streaming response starts immediately, so it is not bound by
    the 150s request cap — the slot may take as long as the function timeout.

    Each event carries ``id: task_id`` so the browser can attribute it and
    persist the terminal state (its /api/task/update-status backup).

    When ``callback_url``/``callback_token`` are given, the terminal state is
    ALSO reported server-side (``type:"completed"``/``"failed"``, mirroring
    the executor) — so a closed tab can no longer strand the task row in
    ``processing``. The SSE stream is then a pure live-view optimization.

    The payload must NOT carry `_tongflow` (that installs an HTTP sink); here
    the sink is the in-process queue below.
    """
    q: "queue.Queue[tuple[str, Any]]" = queue.Queue()

    def _run() -> None:
        # Same thread as the slot call → the contextvar sink is visible to
        # progress() invoked inside the slot.
        set_progress_sink(lambda p: q.put(("progress", p)))
        try:
            result = serve_slot(payload, invoke=invoke)
            q.put(("done", result))
        except Exception as e:  # noqa: BLE001
            q.put(("error", str(e)))
        finally:
            q.put(("end", None))

    threading.Thread(target=_run, daemon=True).start()

    def _report(body: dict[str, Any]) -> None:
        if callback_url and callback_token:
            _post(callback_url, {"token": callback_token, **body})

    while True:
        try:
            kind, data = q.get(timeout=10)
        except queue.Empty:
            yield ": ping\n\n"  # keep the connection alive between events
            continue
        if kind == "end":
            return
        if kind == "progress":
            yield _sse({"id": task_id, "status": "RUNNING", "data": data})
        elif kind == "done":
            if isinstance(data, dict) and data.get("success") is False:
                # A slot-reported failure is FAILED (executor semantics) —
                # coded fields (errorCode/errorParams) ride along for the
                # client's guided-fix dialogs and localized history.
                msg = str(data.get("error") or "Task failed")
                yield _sse({"id": task_id, "status": "FAILED", "data": {**data, "message": msg}})
                fail: dict[str, Any] = {"type": "failed", "error": msg}
                if isinstance(data.get("errorCode"), str):
                    fail["errorCode"] = data["errorCode"]
                    fail["errorParams"] = data.get("errorParams") or {}
                _report(fail)
            else:
                yield _sse({"id": task_id, "status": "COMPLETED", "data": data})
                _report({"type": "completed", "result": data})
        elif kind == "error":
            yield _sse({"id": task_id, "status": "FAILED", "data": {"message": "Task execution failed", "error": data}})
            _report({"type": "failed", "error": str(data)})


def _resolve_method(deploy_file: str, node_slot: str) -> str:
    """slot -> handler method name, AST-parsed from the plugin's deploy.py."""
    from pathlib import Path

    from .parse_deploy import _slot_to_ident, parse_deploy_py

    path = Path(deploy_file).resolve()
    if path.name != "deploy.py":
        path = path.parent / "deploy.py"
    scan, err = parse_deploy_py(path)
    if err or scan is None:
        raise RuntimeError(err or f"failed to parse {path}")
    method = scan.methods_by_slot.get(_slot_to_ident(node_slot))
    if not method:
        raise RuntimeError(f"no method for nodeSlot={node_slot!r}")
    return method


def serve_stream_from_spec(
    origin: str,
    task_id: str,
    token: str,
    deploy_file: str,
    *,
    invoke: InvokeFn,
) -> Iterator[str]:
    """Browser-direct entry: fetch the run spec from the Worker, then stream.

    The browser connects (EventSource) straight to the plugin with only
    ``taskId``/``token``/``origin`` (an input can't ride in a URL), so the
    plugin pulls the spec — ``{nodeSlot, input, assetEndpoint, assetToken}`` —
    from ``GET {origin}/api/executor/spec?taskId=`` (Bearer ``token``, which the
    Worker verifies), resolves the slot method, and delegates to serve_stream.
    Spec-fetch errors surface as a terminal FAILED SSE event, not a 500.
    """
    try:
        req = urllib.request.Request(
            f"{origin}/api/executor/spec?taskId={task_id}",
            headers={
                "Authorization": f"Bearer {token}",
                "User-Agent": "tongflow-plugin/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
            spec = json.loads(resp.read().decode())
        method = _resolve_method(deploy_file, spec["nodeSlot"])
        payload = {
            "nodeSlot": spec["nodeSlot"],
            "method": method,
            "input": spec.get("input") or {},
            "assetEndpoint": spec["assetEndpoint"],
            "assetToken": spec["assetToken"],
        }
        # Router-style plugins pick their backing model per request.
        if spec.get("model"):
            payload["model"] = spec["model"]
    except Exception as e:  # noqa: BLE001
        yield _sse({"id": task_id, "status": "FAILED", "data": {"message": "Spec fetch failed", "error": str(e)}})
        return
    yield from serve_stream(
        payload,
        invoke=invoke,
        task_id=task_id,
        callback_url=str(spec.get("callbackUrl") or ""),
        callback_token=str(spec.get("callbackToken") or ""),
    )
