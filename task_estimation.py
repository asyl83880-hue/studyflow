"""Прозрачная приблизительная оценка для MVP; не требует AI/API-ключа."""
import math
import re
import unicodedata
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Difficulty = Literal["easy", "medium", "hard"]
TaskType = Literal["auto", "exercises", "reading", "memorization", "essay", "project", "test", "programming", "presentation"]
LEVEL_TO_NUMBER = {"easy": 1, "medium": 3, "hard": 5}


def difficulty_level(value: int | str) -> Difficulty:
    if isinstance(value, str) and value in LEVEL_TO_NUMBER:
        return value
    return "easy" if value <= 2 else "medium" if value == 3 else "hard"


class EstimateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    subject: str = Field(min_length=1, max_length=100)
    topic: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    task_type: TaskType = "auto"


class EstimateResponse(BaseModel):
    difficulty: Difficulty
    estimated_time: int
    task_type: TaskType
    reasons: list[str]
    warnings: list[str]
    method: str = "rules-v1"


TYPE_RULES = [
    ("project", r"проект|исследован|жоба|project|research"),
    ("presentation", r"презентац|слайд|баяндама|presentation|slides"),
    ("programming", r"программ|написать код|алгоритм|код жаз|programming|write.*code"),
    ("essay", r"эссе|сочинен|шығарма|essay"),
    ("test", r"тест|контрольн|пробник|емтихан|mock|test|exam"),
    ("memorization", r"выуч|запом|зауч|жатта|memor|learn.*words"),
    ("exercises", r"реш|задач|упражнен|есеп|solve|exercise|#\s*\d"),
    ("reading", r"прочит|читать|оқы|read|параграф|§"),
]
TYPE_LABELS = {
    "exercises": "задачи и упражнения", "reading": "чтение",
    "memorization": "запоминание", "essay": "эссе",
    "project": "проект", "test": "тест", "programming": "программирование",
    "presentation": "презентация",
}


def normalized(value: str) -> str:
    # NFKC превращает № в «No»; сохраняем значение маркера до нормализации.
    return unicodedata.normalize("NFKC", value.replace("№", "#")).lower().replace("ё", "е").translate(str.maketrans({"–": "-", "—": "-", "−": "-"}))


def quantity(text: str, marker: str) -> int | None:
    # «5 задач» — количество; «№ 5–8, 10» — номера, а не десять задач.
    text = re.sub(r"§\s*\d+", "", text)
    explicit = re.search(rf"\b(\d{{1,4}})\s*(?:{marker})", text)
    if explicit:
        return min(200, max(1, int(explicit.group(1))))
    numbered = re.search(rf"(?:{marker}|[№#])\s*([\d,;\s-]+)", text)
    if not numbered:
        return None
    values = set()
    for part in re.finditer(r"(\d{1,4})(?:\s*-\s*(\d{1,4}))?", numbered.group(1)):
        first = int(part.group(1))
        last = int(part.group(2) or first)
        # Слишком большие/обратные диапазоны не разворачиваем.
        if last < first or last - first > 199:
            return None
        values.update(range(first, last + 1))
    return min(200, len(values)) or None


def estimate_task(data: EstimateRequest) -> EstimateResponse:
    subject = normalized(data.subject)
    text = normalized(f"{data.topic} {data.description or ''}")
    detected = next((kind for kind, pattern in TYPE_RULES if re.search(pattern, text)), None)
    kind = detected if data.task_type == "auto" else data.task_type
    kind = kind or "exercises"
    warnings = ["Это приблизительная оценка. Учитывай свой темп и при необходимости исправь время."]
    if not detected and data.task_type == "auto":
        warnings.append("Тип задания не указан явно: предполагаем обычные упражнения.")
    reasons = [f"Тип задания: {TYPE_LABELS[kind]}."]
    level: Difficulty = "easy" if kind in {"reading", "memorization"} else "hard" if kind in {"project", "programming"} else "medium"
    hard_topic = bool(re.search(r"стереометр|тригонометр|логарифм|производн|интеграл|электродинам|органическ|рекурси|динамическ|доказ|олимпиад|proof", text))
    if hard_topic:
        level = "hard"
        reasons.append("Тема или описание требуют нескольких шагов рассуждения.")
    elif re.search(r"простые|базовые|повторение|арифметик|словар|basic|revision", text) and kind not in {"project", "programming"}:
        level = "easy"
        reasons.append("В описании есть повторение или базовые упражнения.")

    if re.search(r"физ|physics", subject):
        per_exercise = 10
    elif re.search(r"матем|алгебр|геометр|хим|math|chem", subject):
        per_exercise = 8
    elif re.search(r"англ|english|тілі|язык", subject):
        per_exercise = 4
    elif re.search(r"биолог|истор|географ|biology|history", subject):
        per_exercise = 5
    else:
        per_exercise = 6
    reasons.append(f"Предмет: {data.subject}.")

    if kind == "exercises":
        count = quantity(normalized(data.description or data.topic), r"задач[а-я]*|упражнен[а-я]*|пример[а-я]*|уравнен[а-я]*|есеп[а-яәіңғүұқөһ]*|exercises?|problems?")
        minutes = 5 + (count or 3) * per_exercise
        reasons.append(f"Объём: {count} упражнений." if count else "Объём не указан: предполагаем 3 упражнения.")
        if re.search(r"прочит|читать|оқы|read", text):
            minutes += 15
            reasons.append("Добавлено 15 минут на предварительное чтение.")
    elif kind == "reading":
        count = quantity(text, r"стр\.?|страниц[а-я]*|бет|pages?")
        minutes = 5 + count * 2 if count else 20
        reasons.append(f"Объём чтения: {count} страниц." if count else "Объём чтения не указан: предполагаем один небольшой раздел.")
    elif kind == "memorization":
        match = re.search(r"(\d{1,3})\s*(?:слов|термин|сөз|words?)", text)
        minutes = 5 + int(match.group(1)) * 2 if match else 25
    else:
        minutes = {"essay": 60, "project": 90, "test": 40, "programming": 60, "presentation": 60}[kind]
        if kind == "presentation":
            match = re.search(r"(\d{1,2})\s*(?:слайд|slides?)", text)
            if match:
                minutes = 10 + int(match.group(1)) * 7
        if re.search(r"прочит|оқы|read", text):
            minutes += 15
            reasons.append("Добавлено время на предварительное чтение.")
    # Сложность меняет оценку, большой объём сам по себе не делает тему сложной.
    minutes *= {"easy": 0.85, "medium": 1, "hard": 1.3}[level]
    estimated = max(5, min(1440, math.ceil(minutes / 5) * 5))
    if estimated == 1440:
        warnings.append("Объём очень большой: оценка ограничена 1440 минутами. Уточни время вручную.")
    return EstimateResponse(difficulty=level, estimated_time=estimated, task_type=kind, reasons=reasons, warnings=warnings)
