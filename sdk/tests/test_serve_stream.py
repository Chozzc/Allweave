import json

import tongflow.serve as serve_mod


def _frames(gen):
    return [json.loads(f[len("data: ") :]) for f in gen if f.startswith("data: ")]


def test_stream_success_reports_completed(monkeypatch):
    posted = []
    monkeypatch.setattr(serve_mod, "serve_slot", lambda p, invoke: {"success": True, "text": "hi"})
    monkeypatch.setattr(serve_mod, "_post", lambda url, body: posted.append((url, body)))

    frames = _frames(
        serve_mod.serve_stream(
            {}, invoke=lambda m, i: None, task_id="t1",
            callback_url="https://cb", callback_token="tok",
        )
    )
    assert frames[-1]["status"] == "COMPLETED"
    assert posted == [("https://cb", {"token": "tok", "type": "completed", "result": {"success": True, "text": "hi"}})]


def test_stream_slot_failure_is_failed_with_coded_fields(monkeypatch):
    posted = []
    result = {
        "success": False,
        "error": "XAI_API_KEY is not set.",
        "errorCode": "missing_api_key",
        "errorParams": {"key": "XAI_API_KEY"},
    }
    monkeypatch.setattr(serve_mod, "serve_slot", lambda p, invoke: result)
    monkeypatch.setattr(serve_mod, "_post", lambda url, body: posted.append(body))

    frames = _frames(
        serve_mod.serve_stream(
            {}, invoke=lambda m, i: None, task_id="t2",
            callback_url="https://cb", callback_token="tok",
        )
    )
    assert frames[-1]["status"] == "FAILED"
    assert frames[-1]["data"]["errorCode"] == "missing_api_key"
    assert posted[-1]["type"] == "failed"
    assert posted[-1]["errorCode"] == "missing_api_key"
    assert posted[-1]["errorParams"] == {"key": "XAI_API_KEY"}


def test_stream_exception_reports_failed(monkeypatch):
    posted = []

    def _boom(p, invoke):
        raise RuntimeError("kaput")

    monkeypatch.setattr(serve_mod, "serve_slot", _boom)
    monkeypatch.setattr(serve_mod, "_post", lambda url, body: posted.append(body))

    frames = _frames(
        serve_mod.serve_stream(
            {}, invoke=lambda m, i: None, task_id="t3",
            callback_url="https://cb", callback_token="tok",
        )
    )
    assert frames[-1]["status"] == "FAILED"
    assert posted[-1] == {"token": "tok", "type": "failed", "error": "kaput"}


def test_stream_without_callback_posts_nothing(monkeypatch):
    posted = []
    monkeypatch.setattr(serve_mod, "serve_slot", lambda p, invoke: {"success": True})
    monkeypatch.setattr(serve_mod, "_post", lambda url, body: posted.append(body))

    frames = _frames(serve_mod.serve_stream({}, invoke=lambda m, i: None, task_id="t4"))
    assert frames[-1]["status"] == "COMPLETED"
    assert posted == []


def test_from_spec_passes_model_and_callback(monkeypatch):
    spec = {
        "nodeSlot": "gen-text",
        "input": {"text": "hi"},
        "assetEndpoint": "https://o/api/engine-assets",
        "assetToken": "at",
        "model": "grok-4.5",
        "callbackUrl": "https://o/api/executor/callback",
        "callbackToken": "ct",
    }

    class _Resp:
        def read(self):
            return json.dumps(spec).encode()

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(serve_mod.urllib.request, "urlopen", lambda req, timeout=30: _Resp())
    monkeypatch.setattr(serve_mod, "_resolve_method", lambda f, slot: "gen_text")

    seen = {}

    def _fake_stream(payload, *, invoke, task_id, callback_url, callback_token):
        seen.update(payload=payload, task_id=task_id, cb=(callback_url, callback_token))
        yield "data: {}\n\n"

    monkeypatch.setattr(serve_mod, "serve_stream", _fake_stream)

    list(serve_mod.serve_stream_from_spec("https://o", "t5", "tok", "deploy.py", invoke=lambda m, i: None))
    assert seen["payload"]["model"] == "grok-4.5"
    assert seen["cb"] == ("https://o/api/executor/callback", "ct")
