from tongflow.errors import CodedPluginError, MissingApiKeyError, failure_payload


def test_plain_exception_payload_matches_historical_shape():
    assert failure_payload(RuntimeError("boom")) == {
        "success": False,
        "error": "boom",
    }


def test_missing_api_key_payload_carries_code_and_params():
    e = MissingApiKeyError("XAI_API_KEY", url="https://console.x.ai")
    out = failure_payload(e)
    assert out["success"] is False
    assert out["errorCode"] == "missing_api_key"
    assert out["errorParams"] == {
        "key": "XAI_API_KEY",
        "url": "https://console.x.ai",
    }
    assert "XAI_API_KEY" in out["error"]


def test_missing_api_key_without_url_omits_param():
    out = failure_payload(MissingApiKeyError("ARK_API_KEY"))
    assert out["errorParams"] == {"key": "ARK_API_KEY"}


def test_custom_message_and_code_passthrough():
    e = CodedPluginError("quota exhausted", code="quota_exceeded", params={"key": "K"})
    out = failure_payload(e)
    assert out["error"] == "quota exhausted"
    assert out["errorCode"] == "quota_exceeded"
