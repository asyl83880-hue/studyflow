from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator
from .task_estimation import Difficulty, EstimateRequest, LEVEL_TO_NUMBER, difficulty_level, estimate_task


def utc_deadline(value):
    # В SQLite храним UTC; вход без часового пояса также считается UTC.
    if value is not None and value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


class TaskBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    subject: str = Field(min_length=1, max_length=100)
    topic: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    deadline: datetime
    difficulty: int = Field(ge=1, le=5)
    estimated_time: int = Field(gt=0)

    @field_validator("difficulty", mode="before", json_schema_input_type=Difficulty | int)
    @classmethod
    def normalize_difficulty(cls, value):
        if isinstance(value, bool):
            raise ValueError("Укажи easy, medium, hard или прежнее число 1–5")
        return LEVEL_TO_NUMBER.get(value, value) if isinstance(value, str) else value

    @field_validator("deadline")
    @classmethod
    def normalize_deadline(cls, value):
        return utc_deadline(value)


class TaskCreate(TaskBase):
    difficulty: int | None = Field(default=None, ge=1, le=5)
    estimated_time: int | None = Field(default=None, gt=0, le=43200)

    @model_validator(mode="after")
    def fill_estimate(self):
        if self.difficulty is None or self.estimated_time is None:
            estimate = estimate_task(EstimateRequest(subject=self.subject, topic=self.topic, description=self.description))
            if self.difficulty is None:
                self.difficulty = LEVEL_TO_NUMBER[estimate.difficulty]
            if self.estimated_time is None:
                self.estimated_time = estimate.estimated_time
        return self


class TaskUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    subject: str | None = Field(default=None, min_length=1, max_length=100)
    topic: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    deadline: datetime | None = None
    difficulty: int | None = Field(default=None, ge=1, le=5)
    estimated_time: int | None = Field(default=None, gt=0, le=43200)
    completed: bool | None = None

    _normalize_difficulty = field_validator("difficulty", mode="before", json_schema_input_type=Difficulty | int)(TaskBase.normalize_difficulty.__func__)

    @field_validator("deadline")
    @classmethod
    def normalize_deadline(cls, value):
        return utc_deadline(value)

    @model_validator(mode="after")
    def reject_required_nulls(self):
        for name in self.model_fields_set - {"description"}:
            if getattr(self, name) is None:
                raise ValueError(f"Поле {name} не может быть null")
        return self


class TaskResponse(TaskBase):
    id: int
    completed: bool

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("difficulty", return_type=Difficulty)
    def serialize_difficulty(self, value):
        # Старая SQLite совместима; наружу отдаём уровни MVP.
        return difficulty_level(value)

    @field_serializer("deadline")
    def serialize_deadline(self, value):
        # Явный +00:00 позволяет браузеру правильно показать местное время.
        return value.replace(tzinfo=timezone.utc).isoformat()
