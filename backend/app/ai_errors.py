"""Log provider error categories without prompts, keys, or raw response bodies."""
import logging

logger = logging.getLogger(__name__)

KNOWN_CODES = frozenset({
    "insufficient_quota", "credit_balance_exhausted", "organization_spend_limit_exceeded",
    "project_spend_limit_exceeded", "organization_usage_limit_exceeded",
    "rate_limit_exceeded", "slow_down", "server_is_overloaded", "invalid_api_key",
})
KNOWN_TYPES = frozenset({
    "insufficient_quota", "rate_limit_error", "invalid_request_error",
    "authentication_error", "service_unavailable_error", "server_error",
})


def record_provider_failure(response, operation):
    if response.is_success:
        return
    try:
        payload = response.json()
        error = payload.get("error") if isinstance(payload, dict) else None
        error = error if isinstance(error, dict) else {}
    except (ValueError, TypeError):
        error = {}
    code = error.get("code")
    category = error.get("type")
    code = code if isinstance(code, str) and code in KNOWN_CODES else "unknown"
    category = category if isinstance(category, str) and category in KNOWN_TYPES else "unknown"
    operation = operation if operation in ("recognize", "tutor") else "unknown"
    logger.warning("OpenAI failure operation=%s status=%s code=%s type=%s",
                   operation, response.status_code, code, category)
