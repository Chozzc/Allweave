"""Resolve a node's ABI input params from its bindings table.

Direct translation of ``resolveNodeParams`` in ``src/lib/task/runner.ts``.
Values are read, in order, from: the upstream executable's projected output
view, the live data-node state (``texts`` / ``fileKeys``), then the
workflow-level inputs (for data nodes flagged as inputs).

Batch fan-out: when the node's ``batchField`` (a scalar handle promoted via
``batchOn`` in the canvas sourceSpec) collects N upstream values,
``resolve_node_param_sets`` returns N param sets — one per value, every other
field broadcast — mirroring the canvas-side ``buildPrompts`` expansion. Any
other scalar-shaped input that collects more than one value is an error:
one-click execution must never silently drop items produced by an upstream
split.
"""

from __future__ import annotations

from typing import Any, Optional


def resolve_node_param_sets(
    node: dict[str, Any],
    output_views: dict[str, dict[str, Any]],
    data_node_state: dict[str, dict[str, Any]],
    data_nodes: list[dict[str, Any]],
    inputs: dict[str, Any],
) -> list[dict[str, Any]]:
    """Resolve params, fanning out over the node's batch field.

    Returns one param set per invocation the runner must perform (always at
    least one). N sets only occur when ``node["batchField"]`` collected N
    upstream values.
    """
    params: dict[str, Any] = {}
    bindings = node.get("bindings")
    if not bindings:
        return [params]

    batch_field = node.get("batchField")
    batch_values: Optional[list[str]] = None

    data_node_map = {d["id"]: d for d in data_nodes if isinstance(d, dict) and "id" in d}

    def read_source(from_node_id: str, from_field: str) -> list[str]:
        # 1) Upstream executable: read the projected view.
        view = output_views.get(from_node_id)
        if view is not None:
            channel = view.get(from_field)
            return list(channel["values"]) if channel else []
        # 2) Upstream data node: read live state (texts / fileKeys).
        slot = data_node_state.get(from_node_id)
        if slot is not None:
            if from_field == "texts" and slot.get("texts"):
                return list(slot["texts"])
            if from_field == "fileKeys" and slot.get("fileKeys"):
                return list(slot["fileKeys"])
        # 3) Workflow input fallback (data node with inputName).
        dn = data_node_map.get(from_node_id)
        if dn and dn.get("inputName"):
            supplied = inputs.get(dn["inputName"])
            if isinstance(supplied, dict):
                arr = supplied.get(from_field)
                if isinstance(arr, list):
                    return [str(v) for v in arr]
            elif isinstance(supplied, list):
                return [str(v) for v in supplied]
            elif isinstance(supplied, str):
                return [supplied]
        return []

    for field, binding in bindings.items():
        kind = binding.get("kind")
        if kind == "handle":
            collected: list[str] = []
            for s in binding.get("sources", []):
                collected.extend(read_source(s["fromNodeId"], s["fromField"]))
            if binding.get("consumerShape") == "scalar":
                if len(collected) > 1:
                    if field == batch_field:
                        batch_values = collected
                    else:
                        label = (
                            node.get("label")
                            or node.get("feature")
                            or node.get("id")
                            or "?"
                        )
                        raise ValueError(
                            f"Node '{label}' input '{field}' expects a single "
                            f"value but received {len(collected)} upstream "
                            f"values. Refusing to silently drop all but the "
                            f"first — reduce the upstream to one value."
                        )
                elif collected:
                    params[field] = collected[0]
            else:
                params[field] = collected
        elif kind in ("config", "static"):
            params[field] = binding.get("value")
        elif kind == "input":
            params[field] = inputs.get(binding["inputName"])

    if batch_values is None:
        return [params]
    return [{**params, batch_field: v} for v in batch_values]


def resolve_node_params(
    node: dict[str, Any],
    output_views: dict[str, dict[str, Any]],
    data_node_state: dict[str, dict[str, Any]],
    data_nodes: list[dict[str, Any]],
    inputs: dict[str, Any],
) -> dict[str, Any]:
    """Single-invocation variant; errors if the node fans out over its batch field."""
    sets = resolve_node_param_sets(
        node, output_views, data_node_state, data_nodes, inputs
    )
    if len(sets) > 1:
        raise ValueError(
            "Node fans out over its batch field; use resolve_node_param_sets."
        )
    return sets[0]
