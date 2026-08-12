"""Scanner tests for the optional TONGFLOW_SLOT_MODELS declaration."""

from __future__ import annotations

import json
from pathlib import Path

from tongflow.scan import scan

_ABI = {
    "version": 1,
    "$defs": {"Asset": {"type": "object"}, "ImageRef": {"type": "object"}},
    "nodes": [
        {
            "nodeSlot": "image-gen",
            "inputs": {"type": "object", "properties": {"text": {"type": "string"}}},
            "outputs": {
                "type": "object",
                "properties": {"image": {"$ref": "#/$defs/ImageRef"}},
            },
        },
        {
            "nodeSlot": "gen-text",
            "inputs": {"type": "object", "properties": {"text": {"type": "string"}}},
            "outputs": {
                "type": "object",
                "properties": {"text": {"type": "string"}},
            },
        },
    ],
}

_HANDLERS = '''
from tongflow.slots import node_slot, NodeSlots
from tongflow.models.image_gen import ImageGenInput, ImageGenOutput

@node_slot(NodeSlots.IMAGE_GEN)
def image_gen(input: ImageGenInput) -> ImageGenOutput:
    ...
'''


def _write_abi(tmp_path: Path) -> Path:
    p = tmp_path / "abi.json"
    p.write_text(json.dumps(_ABI), encoding="utf-8")
    return p


def _write_plugin(tmp_path: Path, entry_src: str) -> Path:
    root = tmp_path / "plugins"
    pdir = root / "tongflow-api-fake"
    pdir.mkdir(parents=True)
    (pdir / "entry.py").write_text(entry_src, encoding="utf-8")
    return root


def _entry(root: Path, abi: Path) -> dict:
    payload = scan(root, abi)
    return payload  # type: ignore[return-value]


def test_scan_without_models_is_unchanged(tmp_path):
    payload = _entry(_write_plugin(tmp_path, _HANDLERS), _write_abi(tmp_path))
    assert payload["errors"] == []
    entry = payload["plugins"]["tongflow-api-fake"]["methodsByNodeSlot"]["image-gen"]
    assert entry == {"methodName": "image_gen"}


def test_scan_with_models_attaches_list(tmp_path):
    src = (
        'TONGFLOW_SLOT_MODELS = {"image-gen": ["z-image-turbo", "seedream-4.5"]}\n'
        + _HANDLERS
    )
    payload = _entry(_write_plugin(tmp_path, src), _write_abi(tmp_path))
    assert payload["errors"] == []
    entry = payload["plugins"]["tongflow-api-fake"]["methodsByNodeSlot"]["image-gen"]
    assert entry["models"] == ["z-image-turbo", "seedream-4.5"]


def test_scan_models_slot_without_handler_errors(tmp_path):
    src = 'TONGFLOW_SLOT_MODELS = {"gen-text": ["gpt-5"]}\n' + _HANDLERS
    payload = _entry(_write_plugin(tmp_path, src), _write_abi(tmp_path))
    assert any("no @node_slot handler" in e["message"] for e in payload["errors"])
    entry = payload["plugins"]["tongflow-api-fake"]["methodsByNodeSlot"]["image-gen"]
    assert "models" not in entry


def test_scan_models_non_literal_errors(tmp_path):
    src = (
        '_M = ["a"]\n'
        "TONGFLOW_SLOT_MODELS = {\"image-gen\": _M}\n" + _HANDLERS
    )
    payload = _entry(_write_plugin(tmp_path, src), _write_abi(tmp_path))
    assert any("list literal" in e["message"] for e in payload["errors"])


def test_scan_models_duplicate_model_errors(tmp_path):
    src = (
        'TONGFLOW_SLOT_MODELS = {"image-gen": ["a", "a"]}\n' + _HANDLERS
    )
    payload = _entry(_write_plugin(tmp_path, src), _write_abi(tmp_path))
    assert any("duplicate model" in e["message"] for e in payload["errors"])


def test_scan_accepts_router_prefix(tmp_path):
    # tongflow-router-* (aggregator plugins) are entry.py runners like -api-.
    root = tmp_path / "plugins"
    pdir = root / "tongflow-router-fake"
    pdir.mkdir(parents=True)
    (pdir / "entry.py").write_text(_HANDLERS, encoding="utf-8")
    payload = _entry(root, _write_abi(tmp_path))
    assert payload["errors"] == []
    assert "tongflow-router-fake" in payload["plugins"]


def test_scan_accepts_local_prefix(tmp_path):
    # tongflow-local-* (on-device engine plugins) are entry.py runners like -api-.
    root = tmp_path / "plugins"
    pdir = root / "tongflow-local-fake"
    pdir.mkdir(parents=True)
    (pdir / "entry.py").write_text(_HANDLERS, encoding="utf-8")
    payload = _entry(root, _write_abi(tmp_path))
    assert payload["errors"] == []
    assert "tongflow-local-fake" in payload["plugins"]
