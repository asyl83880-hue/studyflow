"""Explicit provider selection; credentials stay on the server."""
import os
import re

from fastapi import HTTPException

CLOUDFLARE_MODEL = "@cf/google/gemma-4-26b-a4b-it"
# Only models reviewed for Workers Free are allowed. No automatic provider fallback.
CLOUDFLARE_FREE_MODELS = frozenset({CLOUDFLARE_MODEL})


def provider_name():
    value = os.getenv("STUDYFLOW_AI_PROVIDER", "openai").strip().lower()
    return value if value in {"openai", "cloudflare"} else "unavailable"


def configured_model():
    if provider_name() == "cloudflare":
        return os.getenv("CLOUDFLARE_MODEL", CLOUDFLARE_MODEL).strip() or CLOUDFLARE_MODEL
    return os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"


def is_configured():
    provider = provider_name()
    if provider == "openai":
        return bool(os.getenv("OPENAI_API_KEY", "").strip())
    if provider == "cloudflare":
        return bool(
            re.fullmatch(r"[a-fA-F0-9]{32}", os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip())
            and os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
            and configured_model() in CLOUDFLARE_FREE_MODELS
        )
    return False


def require_configured():
    if not is_configured():
        raise HTTPException(503, {
            "code": "ai_not_configured",
            "message": "AI пока не настроен. Задания, календарь и планирование доступны.",
        })
