"""Понятные правила MVP. Карта вычисляется из SQLite, без кеша и AI-вызовов."""

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from .mini_tests import concept_key, normalized, stable_key, stored_questions, topic_key, utc_now, utc_text
from .models import MiniTest, Task, TestAnswer, TestResult

CALCULATION_VERSION = "knowledge-rules-v1"
STATUSES = ("mastered", "good", "needs_practice", "weak", "not_studied")


@dataclass(frozen=True)
class Observation:
    test_id: str
    completed_at: datetime
    correct_count: int
    total_count: int
    errors: Counter
    student_level: str

    @property
    def percent(self):
        return 100 * self.correct_count / self.total_count


def recommend(label, status):
    messages = {
        "weak": f"У тебя слабый уровень по теме «{label}». Начни с понятного объяснения.",
        "needs_practice": f"Тему «{label}» стоит потренировать: в последних тестах были ошибки.",
        "good": f"Тема «{label}» получается хорошо. Закрепи результат практикой.",
        "mastered": f"Тема «{label}» освоена по проверенным вопросам. Иногда возвращайся к ней.",
        "not_studied": f"По теме «{label}» пока нет результатов. Начни с объяснения и самопроверки.",
    }
    count = 3 if status in ("weak", "needs_practice") else 2
    steps = []
    if status in ("weak", "needs_practice", "not_studied"):
        steps.append({"action": "explain", "label": "Повторить объяснение" if status != "not_studied" else "Изучить объяснение"})
    if status != "mastered":
        steps.append({"action": "practice", "label": f"Решить {count} задания", "exercise_count": count})
    steps.append({"action": "mini_test", "label": "Пройти мини-тест"})
    return {"message": messages[status], "steps": steps}


def assess(observations, label):
    ordered = sorted(observations, key=lambda item: (item.completed_at, item.test_id), reverse=True)
    recent = ordered[:3]
    count = sum(item.total_count for item in ordered)
    correct = sum(item.correct_count for item in ordered)
    errors = sum((item.errors for item in recent), Counter())
    base = {
        "attempts": len(ordered), "answered_count": count,
        "correct_count": correct, "incorrect_count": count - correct,
        "recent_errors": sum(errors.values()),
        "recent_error_types": [{"error_type": key, "count": value} for key, value in sorted(errors.items())],
        "recent_results": [{
            "test_id": item.test_id, "completed_at": utc_text(item.completed_at),
            "correct_count": item.correct_count, "total_count": item.total_count,
            "score_percent": round(item.percent, 1),
        } for item in recent],
        "last_test_at": utc_text(recent[0].completed_at) if recent else None,
        "student_level": recent[0].student_level if recent else "beginner",
        "provisional": bool(recent) and (len(ordered) < 3 or count < 5),
    }
    if not recent:
        status, score, reason = "not_studied", None, "По этой теме ещё нет сданных мини-тестов."
    else:
        # Новейшая попытка весит 3, предыдущая 2, третья 1.
        weights = (3, 2, 1)[:len(recent)]
        score = sum(item.percent * weight for item, weight in zip(recent, weights)) / sum(weights)
        repeated = len(recent) >= 2 and any(
            all(item.errors[error] > 0 for item in recent[:2]) for error in ("concept", "procedure")
        )
        if recent[0].percent < 50 or score < 50:
            status = "weak"
            reason = "В последней попытке или в среднем по последним тестам верно меньше половины ответов."
        elif score < 75 or repeated:
            status = "needs_practice"
            reason = ("В двух последних попытках повторяются ошибки в понимании правила или порядке действий."
                      if repeated else "Средний результат последних попыток — от 50% до 75%. Есть что потренировать.")
        elif score >= 90 and len(ordered) >= 3 and count >= 5 and all(item.percent >= 90 for item in recent[:2]):
            status = "mastered"
            reason = "Не менее трёх попыток и пяти ответов; средний результат от 90%, две последние попытки — от 90%."
        else:
            status = "good"
            reason = "Результат от 75%. Уверенное освоение нужно подтвердить несколькими успешными попытками."
    return {
        **base, "status": status, "score_percent": round(score, 1) if score is not None else None,
        "reason": reason, "recommendation": recommend(label, status),
    }


def build_knowledge_map(db: Session, owner_id: str):
    topics = {}
    topic_evidence = defaultdict(list)
    concept_evidence = defaultdict(list)
    completed_ids = set()

    def remember(subject, label):
        key = topic_key(subject, label)
        if key not in topics:
            topics[key] = {"subject": subject, "label": label, "concepts": {}}
        return key, topics[key]

    for task in db.query(Task).filter_by(owner_id=owner_id).order_by(Task.id):
        remember(task.subject, task.topic)

    # Снимки, результаты и ответы читаются одним запросом. Не нужен запрос на каждую тему.
    rows = db.query(MiniTest, TestResult, TestAnswer).outerjoin(
        TestResult, MiniTest.id == TestResult.test_id,
    ).outerjoin(TestAnswer, TestResult.test_id == TestAnswer.test_id).filter(MiniTest.owner_id == owner_id).order_by(
        MiniTest.created_at, MiniTest.id, TestAnswer.question_id,
    ).all()
    tests = {}
    for test, result, answer in rows:
        if test.id not in tests:
            tests[test.id] = (test, result, [])
        if answer is not None:
            tests[test.id][2].append(answer)

    for test, result, answers in tests.values():
        key, node = remember(test.subject, test.topic)
        # Последнее известное написание; нормализация и ключи прежнего дня сохранены.
        node["subject"], node["label"] = test.subject, test.topic
        if result is None:
            for question in stored_questions(test):
                node["concepts"].setdefault(concept_key(test, question.concept_label), question.concept_label)
            continue
        completed_ids.add(test.id)
        errors = Counter(answer.error_type for answer in answers if not answer.is_correct)
        topic_evidence[key].append(Observation(
            test.id, result.completed_at, result.correct_count, result.total_count, errors, test.student_level,
        ))
        grouped = defaultdict(list)
        for answer in answers:
            node["concepts"][answer.concept_key] = answer.concept_label
            grouped[answer.concept_key].append(answer)
        for skill, group in grouped.items():
            concept_evidence[skill].append(Observation(
                test.id, result.completed_at, sum(answer.is_correct for answer in group), len(group),
                Counter(answer.error_type for answer in group if not answer.is_correct), test.student_level,
            ))

    subjects = {}
    statuses = Counter({status: 0 for status in STATUSES})
    concepts_total = 0
    for key, row in sorted(topics.items(), key=lambda item: (normalized(item[1]["subject"]), normalized(item[1]["label"]))):
        concepts = [{"concept_key": skill, "label": label, **assess(concept_evidence[skill], label)}
                    for skill, label in sorted(row["concepts"].items(), key=lambda item: normalized(item[1]))]
        assessment = assess(topic_evidence[key], row["label"])
        studied = [skill for skill in concepts if skill["attempts"]]
        # Успех только в одном навыке не скрывает слабые навыки исходной темы.
        if assessment["status"] in ("good", "mastered") and any(
            skill["status"] in ("weak", "needs_practice") for skill in studied
        ):
            assessment["status"] = "needs_practice"
            assessment["reason"] = "В этой теме есть навыки с ошибками. Потренируй их, даже если общий процент высокий."
        elif assessment["status"] == "mastered" and any(skill["status"] != "mastered" for skill in studied):
            assessment["status"] = "good"
            assessment["reason"] = "Общий результат высокий; освоение отдельных проверенных навыков ещё нужно подтвердить."
        assessment["recommendation"] = recommend(row["label"], assessment["status"])
        statuses[assessment["status"]] += 1
        concepts_total += len(concepts)
        subject_key = stable_key("subject", row["subject"])
        subjects.setdefault(subject_key, {"subject_key": subject_key, "label": row["subject"], "topics": []})["topics"].append({
            "topic_key": key, "label": row["label"], **assessment, "concepts": concepts,
        })
    return {
        "schema_version": 1, "calculation_version": CALCULATION_VERSION, "generated_at": utc_text(utc_now()),
        "summary": {"topics_total": len(topics), "concepts_total": concepts_total,
                    "completed_tests": len(completed_ids), "statuses": dict(statuses)},
        "subjects": list(subjects.values()),
    }
