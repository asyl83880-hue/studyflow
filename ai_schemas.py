from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TaskField = Literal["subject", "topic", "description", "deadline"]


class RecognizedTask(BaseModel):
    """Черновик AI. У него нет id/completed и он не является записью tasks."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    has_task: bool
    subject: str | None = Field(max_length=100)
    topic: str | None = Field(max_length=200)
    description: str | None = Field(max_length=5000)
    deadline: str | None = Field(max_length=300, description="Дедлайн дословно с фотографии")
    deadline_date: date | None = Field(description="Только явно указанная полная дата с годом")
    deadline_time: str | None = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    uncertain_fields: list[TaskField] = Field(max_length=4)
    warnings: list[str] = Field(max_length=10)
    raw_text: str = Field(max_length=7000)


def prepare_draft(result: RecognizedTask) -> RecognizedTask:
    """Не подставляем выдуманные обязательные значения и относительные даты."""
    values = result.model_dump()
    uncertain = set(result.uncertain_fields)
    notes = list(result.warnings)

    for field in ("subject", "topic", "description", "deadline"):
        values[field] = values[field] or None

    if not result.has_task:
        for field in ("subject", "topic", "description", "deadline", "deadline_date", "deadline_time"):
            values[field] = None
        uncertain.update(("subject", "topic", "deadline"))
        notes.append("Не удалось выделить одно задание. Выбери более чёткое фото или заполни поля вручную.")

    for field in ("subject", "topic"):
        if not values[field]:
            uncertain.add(field)

    full_date_is_explicit = (
        values["deadline_date"] is not None
        and values["deadline"] is not None
        and str(values["deadline_date"].year) in values["deadline"]
    )
    if not full_date_is_explicit or "deadline" in uncertain:
        values["deadline_date"] = None
        if not values["deadline"]:
            values["deadline_time"] = None
        uncertain.add("deadline")
        notes.append("Точная дата не определена. Выбери дату дедлайна перед подтверждением.")

    values["uncertain_fields"] = [
        field for field in ("subject", "topic", "description", "deadline") if field in uncertain
    ]
    values["warnings"] = list(dict.fromkeys(notes))[:10]
    return RecognizedTask.model_validate(values)
