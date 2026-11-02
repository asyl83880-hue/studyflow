"""Workers AI Chat Completions with local schema validation and no retries."""
import base64
import json
import logging
import os

import httpx
from fastapi import HTTPException
from pydantic import ValidationError

from .ai_config import configured_model, require_configured

logger = logging.getLogger(__name__)
KNOWN_CODES = frozenset({3003, 3006, 3007, 3008, 3023, 3036, 3040, 3041, 3042, 5004, 5007, 5016, 5035})


def provider_error(response, payload, operation):
    errors = payload.get("errors", []) if isinstance(payload, dict) else []
    error = errors[0] if isinstance(errors, list) and errors and isinstance(errors[0], dict) else {}
    if not error and isinstance(payload, dict) and isinstance(payload.get("error"), dict):
        error = payload["error"]
    raw_code = error.get("code")
    code = int(raw_code) if isinstance(raw_code, (int, str)) and not isinstance(raw_code, bool) and len(str(raw_code)) <= 5 and str(raw_code).isdigit() else None
    code = code if code in KNOWN_CODES else "unknown"
    operation = operation if operation in {"recognize", "tutor", "mini_test"} else "unknown"
    logger.warning("Cloudflare AI failure operation=%s status=%s code=%s", operation, response.status_code, code)
    if code == 3036:
        raise HTTPException(429, {"code": "ai_free_quota_exhausted", "message":
            "Бесплатный дневной лимит AI исчерпан. Попробуй после обновления лимита; задания и планирование доступны."})
    if code == 3040 or response.status_code == 429:
        raise HTTPException(429, {"code": "ai_rate_limited", "message": "AI сейчас занят. Подожди немного и повтори попытку."})
    if code == 5035:
        raise HTTPException(503, {"code": "ai_model_unavailable", "message":
            "Модель AI недоступна на бесплатном тарифе. Задания и планирование работают."})
    if response.status_code in (401, 403):
        raise HTTPException(503, {"code": "ai_configuration_error", "message":
            "AI временно недоступен из-за настроек сервиса. Задания и планирование работают."})
    if response.status_code in (408, 504):
        raise HTTPException(504, "AI отвечает слишком долго. Повтори попытку — введённые данные сохранены.")
    if response.status_code == 413:
        raise HTTPException(422, "Слишком большой запрос к AI. Сократи описание или уменьши фото.")
    raise HTTPException(502, "AI не смог подготовить результат. Повтори попытку позже.")


async def request_structured(schema, instructions, context, max_tokens, *, image=None, operation="tutor"):
    require_configured()
    account = os.environ["CLOUDFLARE_ACCOUNT_ID"].strip()
    token = os.environ["CLOUDFLARE_API_TOKEN"].strip()
    user_content = json.dumps(context, ensure_ascii=False)
    if image is not None:
        encoded = base64.b64encode(image.data).decode("ascii")
        user_content = [
            {"type": "text", "text": user_content},
            {"type": "image_url", "image_url": {"url": f"data:{image.mime_type};base64,{encoded}"}},
        ]
    # JSON mode constrains syntax; the application's original Pydantic schemas
    # validate fields, counts, actions and answer keys before any record is saved.
    body = {
        "model": configured_model(),
        "messages": [
            {"role": "system", "content": instructions + "\n\nВерни только один JSON-объект без Markdown. JSON Schema:\n"
             + json.dumps(schema.model_json_schema(), ensure_ascii=False)},
            {"role": "user", "content": user_content},
        ],
        "response_format": {"type": "json_object"},
        "chat_template_kwargs": {"enable_thinking": False},
        "max_completion_tokens": max_tokens, "temperature": 0.2,
        "stream": False, "store": False, "options": {"rejectIfBusy": True},
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(45.0 if image else 60.0, connect=10.0), follow_redirects=False) as client:
            response = await client.post(
                f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1/chat/completions",
                json=body, headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.TimeoutException:
        raise HTTPException(504, "AI отвечает слишком долго. Повтори попытку — введённые данные сохранены.") from None
    except httpx.RequestError:
        raise HTTPException(503, "Не удалось связаться с AI. Повтори попытку позже.") from None
    try:
        payload = response.json()
    except (ValueError, TypeError):
        payload = None
    failed = not isinstance(payload, dict) or payload.get("success") is False or payload.get("errors") or payload.get("error")
    if not response.is_success or failed:
        provider_error(response, payload, operation)
    try:
        choice = payload["choices"][0]
        if choice.get("finish_reason") == "content_filter" or choice.get("message", {}).get("refusal"):
            raise HTTPException(422, "AI не смог разобрать задание. Уточни тему или выбери другое фото.")
        if choice.get("finish_reason") != "stop":
            raise ValueError("Incomplete response")
        return schema.model_validate_json(choice["message"]["content"])
    except (ValidationError, ValueError, TypeError, KeyError, IndexError, AttributeError):
        raise HTTPException(502, "AI вернул неполный результат. Повтори попытку или добавь задание вручную.") from None
