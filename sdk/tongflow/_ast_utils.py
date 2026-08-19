"""Shared AST helpers for deploy scan and repo scanners."""

from __future__ import annotations

import ast


def _collect_models_roots(tree: ast.Module) -> frozenset[str]:
    """
    Names bound to ``tongflow.models`` submodules, e.g.
    ``from tongflow.models.gen_text import GenTextInput`` or
    ``import tongflow.models.gen_text as gen_text``.

    Imports inside ``try:`` / ``except:`` blocks are included (common in deploy.py
    fallbacks when tongflow is optional at ``modal deploy`` parse time).
    """

    out: set[str] = set()

    def take_import_stmt(node: ast.stmt) -> None:
        if isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            if mod == "tongflow.models" or mod.startswith("tongflow.models."):
                for alias in node.names:
                    if alias.name == "*":
                        continue
                    out.add(alias.asname or alias.name)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                base = alias.name
                if base == "tongflow.models" or base.startswith(
                    "tongflow.models.",
                ):
                    tail = base.rsplit(".", 1)[-1]
                    out.add(alias.asname or tail)

    def walk_body(body: list[ast.stmt]) -> None:
        for node in body:
            take_import_stmt(node)
            if isinstance(node, ast.Try):
                walk_body(node.body)
                for h in node.handlers:
                    walk_body(h.body)
                if node.orelse:
                    walk_body(node.orelse)
                if node.finalbody:
                    walk_body(node.finalbody)

    walk_body(tree.body)
    return frozenset(out)


def _attr_chain_root_models(expr: ast.expr, roots: frozenset[str]) -> bool:
    cur: ast.expr = expr
    while isinstance(cur, ast.Attribute):
        cur = cur.value
    return isinstance(cur, ast.Name) and cur.id in roots


def looks_like_sdk_model_type(
    expr: ast.expr,
    suffix: str,
    module: ast.Module | None,
) -> bool:
    """
    Slot IO annotations must live under ``tongflow.models`` (imported symbols or
    ``models.foo.BarInput``-style chains rooted in a ``tongflow.models`` import).
    """

    if isinstance(expr, ast.Subscript):
        return looks_like_sdk_model_type(expr.value, suffix, module)

    roots = _collect_models_roots(module) if module is not None else frozenset()

    if isinstance(expr, ast.Attribute):
        if not expr.attr.endswith(suffix):
            return False
        if module is None:
            return True
        return _attr_chain_root_models(expr.value, roots)

    if isinstance(expr, ast.Name):
        if not expr.id.endswith(suffix):
            return False
        if module is None:
            return True
        return expr.id in roots

    return False


def decorator_name(expr: ast.expr) -> str | None:
    if isinstance(expr, ast.Name):
        return expr.id
    if isinstance(expr, ast.Attribute):
        return expr.attr
    if isinstance(expr, ast.Call):
        return decorator_name(expr.func)
    return None


SLOT_MODELS_CONST = "TONGFLOW_SLOT_MODELS"
DEFAULT_SLOTS_CONST = "TONGFLOW_DEFAULT_SLOTS"
MODEL_CATALOG_CONST = "TONGFLOW_MODEL_CATALOG"


def _const_assign_value(node: ast.stmt, name: str) -> ast.expr | None:
    """The right-hand side of a module-level ``name = ...`` assignment, if any."""

    if isinstance(node, ast.Assign):
        targets, value = node.targets, node.value
    elif isinstance(node, ast.AnnAssign):
        targets, value = [node.target], node.value
    else:
        return None
    if value is None:
        return None
    if not any(isinstance(t, ast.Name) and t.id == name for t in targets):
        return None
    return value


def extract_default_slots(
    tree: ast.Module,
) -> tuple[list[str], list[tuple[int, str]]]:
    """
    Parse the optional module-level ``TONGFLOW_DEFAULT_SLOTS`` constant: a pure
    list literal of ABI node slots this plugin claims as the default
    implementation of, e.g. ``["image-gen", "image-edit"]``.

    A plain constant rather than a decorator argument on purpose — it is never
    executed, so a plugin declaring it still imports cleanly under any SDK
    version, including the older ones already baked into deployed runtimes.

    Returns ``(slots, problems)``; a malformed constant is reported instead of
    silently ignored.
    """

    slots: list[str] = []
    problems: list[tuple[int, str]] = []

    for node in tree.body:
        value = _const_assign_value(node, DEFAULT_SLOTS_CONST)
        if value is None:
            continue
        if not isinstance(value, (ast.List, ast.Tuple)):
            problems.append(
                (node.lineno, f"{DEFAULT_SLOTS_CONST} must be a list literal of strings")
            )
            continue
        for item in value.elts:
            if not (
                isinstance(item, ast.Constant)
                and isinstance(item.value, str)
                and item.value.strip()
            ):
                problems.append(
                    (
                        getattr(item, "lineno", node.lineno),
                        f"{DEFAULT_SLOTS_CONST} items must be non-empty string literals",
                    )
                )
                continue
            if item.value in slots:
                problems.append(
                    (
                        item.lineno,
                        f"{DEFAULT_SLOTS_CONST} has duplicate slot {item.value!r}",
                    )
                )
                continue
            slots.append(item.value)

    return slots, problems


def extract_slot_models(
    tree: ast.Module,
) -> tuple[dict[str, list[str]], list[tuple[int, str]]]:
    """
    Parse the optional module-level ``TONGFLOW_SLOT_MODELS`` constant:
    a pure dict literal mapping an ABI node slot to the list of model ids the
    plugin exposes for it, e.g. ``{"image-gen": ["z-image-turbo", "seedream-4.5"]}``.

    Only literal ``dict[str, list[str]]`` shapes are accepted — the scanner never
    imports plugin code, so computed values cannot be resolved. Returns
    ``(models_by_slot, problems)`` where each problem is ``(lineno, reason)``;
    a malformed constant is reported instead of silently ignored.
    """

    models_by_slot: dict[str, list[str]] = {}
    problems: list[tuple[int, str]] = []

    for node in tree.body:
        if isinstance(node, ast.Assign):
            targets = node.targets
            value = node.value
        elif isinstance(node, ast.AnnAssign):
            targets = [node.target]
            value = node.value
        else:
            continue
        if value is None:
            continue
        if not any(
            isinstance(t, ast.Name) and t.id == SLOT_MODELS_CONST for t in targets
        ):
            continue

        if not isinstance(value, ast.Dict):
            problems.append(
                (node.lineno, f"{SLOT_MODELS_CONST} must be a dict literal")
            )
            continue
        for key, val in zip(value.keys, value.values):
            if not (isinstance(key, ast.Constant) and isinstance(key.value, str) and key.value):
                problems.append(
                    (
                        getattr(key, "lineno", node.lineno),
                        f"{SLOT_MODELS_CONST} keys must be non-empty string literals",
                    )
                )
                continue
            slot = key.value
            if slot in models_by_slot:
                problems.append(
                    (key.lineno, f"{SLOT_MODELS_CONST} has duplicate slot {slot!r}")
                )
                continue
            if not isinstance(val, ast.List):
                problems.append(
                    (
                        getattr(val, "lineno", node.lineno),
                        f"{SLOT_MODELS_CONST}[{slot!r}] must be a list literal of strings",
                    )
                )
                continue
            models: list[str] = []
            ok = True
            for item in val.elts:
                if not (
                    isinstance(item, ast.Constant)
                    and isinstance(item.value, str)
                    and item.value.strip()
                ):
                    problems.append(
                        (
                            getattr(item, "lineno", val.lineno),
                            f"{SLOT_MODELS_CONST}[{slot!r}] items must be non-empty string literals",
                        )
                    )
                    ok = False
                    break
                if item.value in models:
                    problems.append(
                        (item.lineno, f"{SLOT_MODELS_CONST}[{slot!r}] has duplicate model {item.value!r}")
                    )
                    ok = False
                    break
                models.append(item.value)
            if not ok:
                continue
            if models:
                models_by_slot[slot] = models

    return models_by_slot, problems


def _node_slot_idents(deco: ast.Call) -> list[str]:
    """``NodeSlots.<ident>`` positional arguments of one ``@node_slot(...)`` call."""

    out: list[str] = []
    for arg in deco.args:
        if (
            isinstance(arg, ast.Attribute)
            and isinstance(arg.value, ast.Name)
            and arg.value.id == "NodeSlots"
            and isinstance(arg.attr, str)
            and arg.attr
        ):
            out.append(arg.attr)
    return out


def _iter_node_slot_decorators(
    fn: ast.FunctionDef | ast.AsyncFunctionDef,
) -> list[ast.Call]:
    return [
        deco
        for deco in fn.decorator_list
        if isinstance(deco, ast.Call) and decorator_name(deco.func) == "node_slot"
    ]


def extract_node_slot_decorators(
    fn: ast.FunctionDef | ast.AsyncFunctionDef,
) -> tuple[str, ...]:
    """Collect ``NodeSlots.<ident>`` arguments from ``@node_slot(...)`` calls."""

    slots: list[str] = []
    for deco in _iter_node_slot_decorators(fn):
        slots.extend(_node_slot_idents(deco))
    return tuple(slots)


def extract_node_slot_defaults(
    fn: ast.FunctionDef | ast.AsyncFunctionDef,
) -> tuple[tuple[str, ...], list[tuple[int, str]]]:
    """
    Slots this handler claims as the default implementation, i.e. the
    ``NodeSlots.<ident>`` arguments of every ``@node_slot(..., default=True)``
    call. Returns ``(idents, problems)`` where each problem is
    ``(lineno, reason)``.

    Only a literal ``True`` counts — the scanner never imports plugin code, so a
    computed value cannot be resolved and is reported rather than ignored.
    """

    idents: list[str] = []
    problems: list[tuple[int, str]] = []
    for deco in _iter_node_slot_decorators(fn):
        for kw in deco.keywords:
            if kw.arg != "default":
                continue
            value = kw.value
            if not (isinstance(value, ast.Constant) and isinstance(value.value, bool)):
                problems.append(
                    (
                        getattr(value, "lineno", deco.lineno),
                        "@node_slot(default=...) must be a literal True or False",
                    )
                )
                continue
            if value.value:
                idents.extend(_node_slot_idents(deco))
    return tuple(dict.fromkeys(idents)), problems


def extract_model_catalog(
    tree: ast.Module,
) -> tuple[dict | None, list[tuple[int, str]]]:
    """
    Parse the optional module-level ``TONGFLOW_MODEL_CATALOG`` constant: a pure
    dict literal pointing the canvas at a live, public model catalog so the
    per-node model dropdown can list more than the curated
    ``TONGFLOW_SLOT_MODELS`` shortlist::

        TONGFLOW_MODEL_CATALOG = {
            "url": "https://api.example.com/api/models",  # GET, no auth, CORS
            "authEnv": "EXAMPLE_API_KEY",  # optional: bearer token env key; the
                                           # app proxies the fetch server-side
            "items": "data",      # dot path to the record array (default "data")
            "id": "id",           # dot path to the model id (default "id")
            "exclude": {"upcoming": True},   # drop records where field == value
            "slots": {
                # field -> token(s); a record matches when every token is a
                # substring of that field (arrays/objects are JSON-serialized
                # first); a "!"-prefixed token must be absent instead
                "gen-text": {"features": "text-to-text", "endpoints": "/v1/chat/completions"},
                "text-gen-video": {"endpoints": ["/v1/videos", "!/v1/images"]},
            },
        }

    The canvas fetches ``url`` in the browser, filters records per slot and
    appends the ids after the static shortlist. Returns ``(catalog, problems)``;
    ``catalog`` is ``None`` when the constant is absent or malformed.
    """

    problems: list[tuple[int, str]] = []
    for node in tree.body:
        value = _const_assign_value(node, MODEL_CATALOG_CONST)
        if value is None:
            continue
        try:
            raw = ast.literal_eval(value)
        except (ValueError, SyntaxError, TypeError):
            problems.append(
                (node.lineno, f"{MODEL_CATALOG_CONST} must be a pure dict literal")
            )
            return None, problems
        reason = _validate_model_catalog(raw)
        if reason:
            problems.append((node.lineno, f"{MODEL_CATALOG_CONST} {reason}"))
            return None, problems
        catalog: dict = {
            "url": raw["url"],
            "items": raw.get("items", "data"),
            "id": raw.get("id", "id"),
            "slots": raw["slots"],
        }
        if raw.get("exclude"):
            catalog["exclude"] = raw["exclude"]
        if raw.get("authEnv"):
            catalog["authEnv"] = raw["authEnv"]
        return catalog, problems
    return None, problems


def _validate_model_catalog(raw: object) -> str | None:
    """Shape check for a literal-evaluated ``TONGFLOW_MODEL_CATALOG``; returns a reason or None."""

    if not isinstance(raw, dict):
        return "must be a dict literal"
    allowed = {"url", "authEnv", "items", "id", "exclude", "slots"}
    unknown = set(raw) - allowed
    if unknown:
        return f"has unknown keys {sorted(unknown)!r}"
    url = raw.get("url")
    if not (isinstance(url, str) and url.startswith(("https://", "http://"))):
        return "'url' must be an http(s) URL string"
    for key in ("items", "id"):
        if key in raw and not (isinstance(raw[key], str) and raw[key].strip()):
            return f"'{key}' must be a non-empty dot-path string"
    if "authEnv" in raw and not (isinstance(raw["authEnv"], str) and raw["authEnv"].strip()):
        return "'authEnv' must be a non-empty env var name"
    exclude = raw.get("exclude", {})
    if not isinstance(exclude, dict) or not all(
        isinstance(k, str) and k and isinstance(v, (str, bool, int, float))
        for k, v in exclude.items()
    ):
        return "'exclude' must map field paths to string/bool/number literals"
    slots = raw.get("slots")
    if not isinstance(slots, dict) or not slots:
        return "'slots' must be a non-empty dict of slot -> {field: token}"
    for slot, rules in slots.items():
        if not (isinstance(slot, str) and slot):
            return "'slots' keys must be non-empty strings"
        if not isinstance(rules, dict) or not rules:
            return f"'slots'[{slot!r}] must be a non-empty dict of field -> token"
        for field, token in rules.items():
            tokens = token if isinstance(token, list) else [token]
            if not (
                isinstance(field, str)
                and field
                and tokens
                and all(isinstance(t, str) and t and t != "!" for t in tokens)
            ):
                return f"'slots'[{slot!r}] must map field paths to non-empty string tokens (or lists of them)"
    return None
