"""Typed plugin failures that surface as coded, localizable task errors.

A plugin that raises a :class:`CodedPluginError` (and whose ``entry.py``
bridge reports failures through :func:`failure_payload`) gets more than a
raw message string: the platform receives a stable ``errorCode`` plus
``errorParams`` and can localize the failure and guide the user — e.g. a
missing-API-key dialog that deep-links to the provider console.

Plugins that keep raising plain exceptions lose nothing: their message is
shown verbatim, exactly as before.
"""

from __future__ import annotations

from typing import Any


class CodedPluginError(RuntimeError):
    """Base for failures the platform UI knows how to render and act on."""

    def __init__(
        self, message: str, *, code: str, params: dict[str, str] | None = None
    ) -> None:
        super().__init__(message)
        self.code = code
        self.params = params or {}


class MissingApiKeyError(CodedPluginError):
    """A required provider API key is absent from the environment.

    ``key`` is the env var name (e.g. ``XAI_API_KEY``); ``url`` optionally
    points at the provider console where the user can create one.
    """

    def __init__(self, key: str, *, url: str = "", message: str | None = None) -> None:
        params = {"key": key}
        if url:
            params["url"] = url
        super().__init__(
            message or f"{key} is not set. Add it in TongFlow Settings.",
            code="missing_api_key",
            params=params,
        )


def failure_payload(e: Exception) -> dict[str, Any]:
    """ABI failure dict for an ``entry.py`` bridge's top-level except block.

    Use as ``_write(failure_payload(e))`` — plain exceptions serialize the
    same as the historical ``{"success": False, "error": str(e)}``.
    """
    out: dict[str, Any] = {"success": False, "error": str(e)}
    if isinstance(e, CodedPluginError):
        out["errorCode"] = e.code
        out["errorParams"] = e.params
    return out
