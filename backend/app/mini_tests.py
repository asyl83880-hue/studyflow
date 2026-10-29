"""Снимки тестов, стабильные ключи тем и проверка по сохранённому ключу."""

from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import unicodedata

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import MiniTest, Task, TestAnswer, TestResult
from .tutor_schemas import GeneratedTest, TopicContext

CHOICE_IDS = ("A", "B", "C", "D")
GRADING_VERSION = "single-choice-v1"


def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utc_text(value):
    return value.replace(tzinfo=timezone.utc).isoformat()


def normalized(value):
    return " ".join(unicodedata.normalize("NFKC", value).casefold().replace("ё", "е").split())


def stable_key(prefix, *parts):
    encoded = json.dumps([normalized(part) for part in parts], ensure_ascii=False).encode("utf-8")
    return f"{prefix}-v1-{hashlib.sha256(encoded).hexdigest()[:24]}"


def topic_key(subject, topic):
    return stable_key("topic", subject, topic)


def concept_key(test, label):
    return stable_key("concept", test.topic_key, label)


def request_fingerprint(request):
    excluded = {"request_id"}
    # Совместимость с сохранёнными request_id до появления Knowledge Map.
    if request.focus_concept is None:
        excluded.add("focus_concept")
    encoded = json.dumps(
        request.model_dump(mode="json", exclude=excluded),
        ensure_ascii=False, sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def resolve_context(db: Session, request: TopicContext, owner_id: str):
    data = request.model_dump(exclude={"request_id"}, mode="json")
    data["task_description"] = None
    if request.task_id is not None:
        task = db.query(Task).filter_by(id=request.task_id, owner_id=owner_id).first()
        if task is None:
            raise HTTPException(404, "Задание не найдено. Открой тему отдельно.")
        data.update(subject=task.subject, topic=task.topic, task_description=task.description)
    return data


def stored_questions(test: MiniTest):
    return GeneratedTest.model_validate_json(test.questions_json).questions


def public_choices(question):
    return [{"id": CHOICE_IDS[index], "text": choice.text} for index, choice in enumerate(question.choices)]


def test_summary(test: MiniTest, result: TestResult | None):
    return {
        "id": test.id, "subject": test.subject, "topic": test.topic,
        "topic_key": test.topic_key, "student_level": test.student_level,
        "source_task_id": test.source_task_id, "title": test.title,
        "created_at": utc_text(test.created_at),
        "status": "completed" if result else "in_progress",
        "correct_count": result.correct_count if result else None,
        "total_count": 5, "score_percent": result.score_percent if result else None,
    }


def public_test(db: Session, test: MiniTest):
    return {
        **test_summary(test, db.get(TestResult, test.id)),
        "schema_version": test.schema_version,
        "questions": [{
            "id": f"q{index + 1}", "prompt": question.prompt,
            "concept_key": concept_key(test, question.concept_label),
            "concept_label": question.concept_label, "choices": public_choices(question),
        } for index, question in enumerate(stored_questions(test))],
    }


def grade_answers(test: MiniTest, selections):
    answers = []
    for index, question in enumerate(stored_questions(test)):
        question_id = f"q{index + 1}"
        selected_id = selections[question_id]
        selected = question.choices[CHOICE_IDS.index(selected_id)]
        answers.append(TestAnswer(
            test_id=test.id, question_id=question_id, selected_choice_id=selected_id,
            is_correct=selected_id == CHOICE_IDS[question.correct_index],
            error_type=selected.error_type, feedback=selected.feedback,
            concept_key=concept_key(test, question.concept_label), concept_label=question.concept_label,
        ))
    return answers


def existing_selections(db, test_id):
    return {answer.question_id: answer.selected_choice_id for answer in db.query(TestAnswer).filter_by(test_id=test_id)}


def result_detail(db: Session, test: MiniTest, result: TestResult):
    saved = {answer.question_id: answer for answer in db.query(TestAnswer).filter_by(test_id=test.id)}
    evidence = []
    groups = defaultdict(list)
    for index, question in enumerate(stored_questions(test)):
        question_id = f"q{index + 1}"
        answer = saved[question_id]
        row = {
            "question_id": question_id, "prompt": question.prompt,
            "concept_key": answer.concept_key, "concept_label": answer.concept_label,
            "choices": public_choices(question), "selected_choice_id": answer.selected_choice_id,
            "correct_choice_id": CHOICE_IDS[question.correct_index], "is_correct": answer.is_correct,
            "error_type": answer.error_type, "feedback": answer.feedback, "explanation": question.explanation,
        }
        evidence.append(row)
        groups[answer.concept_key].append(row)
    diagnostics = [{
        "concept_key": key, "concept_label": rows[0]["concept_label"], "total_count": len(rows),
        "correct_count": sum(row["is_correct"] for row in rows),
        "incorrect_count": sum(not row["is_correct"] for row in rows),
        "error_types": sorted({row["error_type"] for row in rows if not row["is_correct"]}),
        "question_ids": [row["question_id"] for row in rows],
    } for key, rows in groups.items()]
    return {
        "schema_version": test.schema_version, "test_id": test.id, "subject": test.subject,
        "topic": test.topic, "topic_key": test.topic_key, "student_level": test.student_level,
        "source_task_id": test.source_task_id, "title": test.title,
        "created_at": utc_text(test.created_at), "completed_at": utc_text(result.completed_at),
        "correct_count": result.correct_count, "total_count": result.total_count,
        "score_percent": result.score_percent, "generator_model": test.model,
        "grading_version": result.grading_version, "answers": evidence,
        "diagnostics": diagnostics,
        "problem_topics": [row for row in diagnostics if row["incorrect_count"] > 0],
    }
