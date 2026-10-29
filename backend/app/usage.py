"""Database-backed daily AI budgets, shared across restarts and instances."""
from datetime import datetime, timedelta, timezone
import hashlib
import os

from fastapi import HTTPException
from sqlalchemy import delete, update
from sqlalchemy.exc import IntegrityError

from .models import UsageCounter


def reserve(db, scope: str, limit: int):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    key = hashlib.sha256(f"{scope}:{now.date().isoformat()}".encode()).hexdigest()
    statement = update(UsageCounter).where(UsageCounter.key == key).values(count=UsageCounter.count + 1).returning(UsageCounter.count)
    count = db.execute(statement).scalar_one_or_none()
    if count is None:
        db.add(UsageCounter(key=key, count=1, expires_at=now + timedelta(days=2)))
        try:
            db.commit()
            count = 1
        except IntegrityError:
            db.rollback()
            count = db.execute(statement).scalar_one()
            db.commit()
    else:
        db.commit()
    if count > limit:
        raise HTTPException(429, "Дневной лимит AI-запросов достигнут. Попробуй завтра; задания и планирование доступны.")
    # Keep counter storage bounded without a scheduled cleanup service.
    db.execute(delete(UsageCounter).where(UsageCounter.expires_at < now))
    db.commit()


def reserve_ai_request(db, owner_id: str):
    if not os.environ.get("OPENAI_API_KEY", "").strip():
        raise HTTPException(503, "AI пока не настроен. Задания, календарь и планирование доступны.")
    reserve(db, f"ai:user:{owner_id}", int(os.getenv("STUDYFLOW_AI_USER_DAILY_LIMIT", "20")))
    reserve(db, "ai:global", int(os.getenv("STUDYFLOW_AI_GLOBAL_DAILY_LIMIT", "100")))
