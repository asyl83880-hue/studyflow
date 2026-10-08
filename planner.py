"""План по дням: дедлайны, короткие блоки, накопленная нагрузка и явный дефицит."""
from collections import defaultdict
from datetime import date as Date, datetime, time, timedelta, timezone
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .task_estimation import Difficulty, difficulty_level


class PlannerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    timezone: str = Field(default="UTC", min_length=1, max_length=100)
    daily_limit: int = Field(default=120, ge=15, le=480)
    horizon_days: int = Field(default=14, ge=1, le=30)
    # Другие дела в пределах бюджета, без заданий из StudyFlow.
    busy_minutes: dict[Date, Annotated[int, Field(ge=0, le=1440)]] = Field(default_factory=dict)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError("Неизвестный часовой пояс") from error
        return value

    @field_validator("busy_minutes")
    @classmethod
    def limit_busy_dates(cls, value):
        if len(value) > 60:
            raise ValueError("Укажи нагрузку не более чем для 60 дат")
        return value


class PlanSession(BaseModel):
    task_id: int
    subject: str
    topic: str
    difficulty: Difficulty
    minutes: int
    task_total_minutes: int
    deadline: datetime
    overdue: bool
    part: int = 1
    parts: int = 1


class PlanDay(BaseModel):
    date: Date
    minutes: int = 0
    busy_minutes: int = 0
    total_minutes: int = 0
    daily_limit: int
    overloaded: bool = False
    sessions: list[PlanSession] = Field(default_factory=list)


class PlanNotice(BaseModel):
    kind: Literal["overload", "high_load", "overdue", "unplanned", "early_start"]
    message: str
    date: Date | None = None
    task_id: int | None = None
    suggestion: str | None = None


class UnplannedTask(BaseModel):
    task_id: int
    subject: str
    topic: str
    minutes: int
    reason: Literal["deadline", "horizon", "capacity"]


class PlanResponse(BaseModel):
    generated_at: datetime
    timezone: str
    daily_limit: int
    horizon_days: int
    pending_tasks: int
    total_minutes: int
    planned_minutes: int
    unplanned_minutes: int
    days: list[PlanDay]
    warnings: list[PlanNotice]
    suggestions: list[PlanNotice]
    unplanned: list[UnplannedTask]


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def duration(minutes: int) -> str:
    hours, rest = divmod(minutes, 60)
    return f"{hours} ч {rest} мин" if hours and rest else f"{hours} ч" if hours else f"{rest} мин"


def day_label(value: Date) -> str:
    names = ["В понедельник", "Во вторник", "В среду", "В четверг", "В пятницу", "В субботу", "В воскресенье"]
    return f"{names[value.weekday()]} ({value:%d.%m})"


def build_plan(tasks, options: PlannerRequest, now: datetime) -> PlanResponse:
    now = as_utc(now)
    tz = ZoneInfo(options.timezone)
    today = now.astimezone(tz).date()
    days = [PlanDay(date=today + timedelta(days=i), daily_limit=options.daily_limit,
                    busy_minutes=options.busy_minutes.get(today + timedelta(days=i), 0))
            for i in range(options.horizon_days)]
    pending = [task for task in tasks if not task.completed]
    weights = {"easy": 0.8, "medium": 1.0, "hard": 1.3}
    # Реальные будущие дедлайны сохраняем раньше догоняющей работы с истёкшим сроком.
    pending.sort(key=lambda task: (as_utc(task.deadline) < now, as_utc(task.deadline),
                                  -weights[difficulty_level(task.difficulty)], task.id))
    effort = defaultdict(float)
    task_minutes = defaultdict(int)
    unplanned = []

    def free_minutes(index, deadline, overdue, soft):
        day = days[index]
        start = max(now, datetime.combine(day.date, time.min, tzinfo=tz).astimezone(timezone.utc))
        end = datetime.combine(day.date + timedelta(days=1), time.min, tzinfo=tz).astimezone(timezone.utc)
        if not overdue:
            end = min(end, deadline)
        clock_minutes = max(0, int((end - start).total_seconds() // 60))
        available = max(0, clock_minutes - day.minutes - day.busy_minutes)
        if soft:
            available = min(available, max(0, options.daily_limit - day.minutes - day.busy_minutes))
        return available

    for task in pending:
        deadline = as_utc(task.deadline)
        due_day = deadline.astimezone(tz).date()
        overdue = deadline < now
        level = difficulty_level(task.difficulty)
        remaining = task.estimated_time
        # Ровные короткие блоки: 90 → 30/30/30, 45 → 23/22 (вместо 30/15).
        number_of_blocks = (remaining + 29) // 30
        block_size = min(30, (remaining + number_of_blocks - 1) // number_of_blocks)
        eligible = [i for i, day in enumerate(days) if overdue or day.date <= due_day]
        preferred = [i for i in eligible if overdue or days[i].date < due_day or due_day == today]

        def allocate(indices, soft):
            nonlocal remaining
            while remaining > 0:
                available = {i: free_minutes(i, deadline, overdue, soft) for i in indices}
                available = {i: minutes for i, minutes in available.items() if minutes > 0}
                if not available:
                    break
                # Разнести части одного задания, учесть уже назначенную работу и сложность.
                index = min(available, key=lambda i: (task_minutes[task.id, i],
                    (effort[i] + days[i].busy_minutes) / options.daily_limit, i))
                minutes = min(block_size, remaining, available[index])
                day = days[index]
                day.sessions.append(PlanSession(task_id=task.id, subject=task.subject, topic=task.topic,
                    difficulty=level, minutes=minutes, task_total_minutes=task.estimated_time,
                    deadline=deadline, overdue=overdue))
                day.minutes += minutes
                effort[index] += minutes * weights[level]
                task_minutes[task.id, index] += minutes
                remaining -= minutes

        allocate(preferred, soft=True)
        # День дедлайна — резерв: используем его лишь когда раньше работа не помещается.
        allocate(eligible, soft=True)
        # Лимит учебной нагрузки мягкий. Избыток показываем с предупреждением,
        # но никогда не назначаем больше реальных минут до дедлайна.
        allocate(eligible, soft=False)
        if remaining:
            reason = "horizon" if due_day > days[-1].date else "deadline" if deadline >= now else "capacity"
            unplanned.append(UnplannedTask(task_id=task.id, subject=task.subject, topic=task.topic,
                                          minutes=remaining, reason=reason))

    warnings = []
    for day in days:
        day.total_minutes = day.minutes + day.busy_minutes
        day.overloaded = day.total_minutes > options.daily_limit
        day.sessions.sort(key=lambda s: (s.overdue, s.deadline, -weights[s.difficulty], s.task_id))
        if day.overloaded:
            warnings.append(PlanNotice(kind="overload", date=day.date,
                message=f"{day_label(day.date)} высокая нагрузка — примерно {duration(day.total_minutes)}. Твой лимит: {duration(options.daily_limit)}.",
                suggestion="Свободные дни до дедлайна уже использованы. Проверь оценку времени, освободи время от других дел или уточни срок."
                if day.minutes else "Другие дела превышают дневной лимит. Постарайся освободить время или перенести часть этих дел."))
        elif day.total_minutes >= 180:
            warnings.append(PlanNotice(kind="high_load", date=day.date,
                message=f"{day_label(day.date)} запланировано примерно {duration(day.total_minutes)}. Предусмотри перерывы."))

    all_sessions = [session for day in days for session in day.sessions]
    for task in pending:
        parts = [s for s in all_sessions if s.task_id == task.id]
        for number, session in enumerate(parts, 1):
            session.part, session.parts = number, len(parts)
    overdue_count = sum(as_utc(task.deadline) < now for task in pending)
    if overdue_count:
        warnings.append(PlanNotice(kind="overdue",
            message=f"Просроченных заданий: {overdue_count}. Для них показан догоняющий план; исходный дедлайн уже прошёл.",
            suggestion="Уточни новый срок и обнови задание."))
    for item in unplanned:
        explanation = "за выбранный период" if item.reason == "horizon" else "до дедлайна" if item.reason == "deadline" else "в доступное время"
        warnings.append(PlanNotice(kind="unplanned", task_id=item.task_id,
            message=f"{item.subject} — {item.topic}: ещё {duration(item.minutes)} не помещается {explanation}.",
            suggestion="Увеличь период плана." if item.reason == "horizon" else "Проверь объём работы и договорись о новом сроке, если времени недостаточно."))

    # Сравнение с вариантом «делать всё в день дедлайна» показывает пользу раннего старта.
    due_load = defaultdict(int)
    moved_earlier = defaultdict(int)
    for task in pending:
        due = as_utc(task.deadline).astimezone(tz).date()
        if today <= due <= days[-1].date:
            due_load[due] += task.estimated_time
            moved_earlier[due] += sum(s.minutes for day in days if day.date < due
                                     for s in day.sessions if s.task_id == task.id)
    suggestions = [PlanNotice(kind="early_start", date=due,
        message=f"{day_label(due)} по дедлайнам было бы {duration(minutes)} работы.",
        suggestion=f"В этом плане {duration(moved_earlier[due])} распределено на более ранние дни.")
        for due, minutes in sorted(due_load.items()) if minutes > options.daily_limit and moved_earlier[due] > 0]
    planned = sum(day.minutes for day in days)
    total = sum(task.estimated_time for task in pending)
    return PlanResponse(generated_at=now, timezone=options.timezone, daily_limit=options.daily_limit,
        horizon_days=options.horizon_days, pending_tasks=len(pending), total_minutes=total,
        planned_minutes=planned, unplanned_minutes=total - planned, days=days,
        warnings=warnings, suggestions=suggestions, unplanned=unplanned)
