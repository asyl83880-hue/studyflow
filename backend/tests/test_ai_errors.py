import httpx
import pytest

from backend.app.ai_errors import record_provider_failure


@pytest.mark.parametrize("code", ["credit_balance_exhausted", "insufficient_quota", "rate_limit_exceeded"])
def test_safe_provider_category_is_recorded(caplog, code):
    response = httpx.Response(429, json={"error": {
        "code": code, "type": "insufficient_quota", "message": "private prompt and credential",
    }})
    record_provider_failure(response, "tutor")
    assert f"code={code}" in caplog.text
    assert "private prompt" not in caplog.text and "credential" not in caplog.text


@pytest.mark.parametrize("payload", [None, {"error": []}, {"error": {"code": ["bad"]}},
                                     {"error": {"code": "private-secret", "type": "private-secret"}}])
def test_unknown_provider_body_is_not_logged(caplog, payload):
    record_provider_failure(httpx.Response(429, json=payload), "recognize")
    assert "code=unknown" in caplog.text
    assert "private-secret" not in caplog.text


def test_non_json_error_and_success_are_safe(caplog):
    record_provider_failure(httpx.Response(502, text="private upstream body"), "recognize")
    assert "code=unknown" in caplog.text and "private upstream body" not in caplog.text
    caplog.clear()
    record_provider_failure(httpx.Response(200, json={"output": "private lesson"}), "tutor")
    assert not caplog.text
