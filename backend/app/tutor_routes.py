"""Обучение -> тест -> неизменяемый результат; всё для одного локального ученика."""

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import mini_tests as service, tutor_ai
from .database import get_db
from .models import MiniTest, TestResult
from .auth import require_user
from .usage import reserve_ai_request
from .tutor_schemas import (
    MiniTestCreate, PublicTest, SavedResult, TestSubmission, TestSummary, TutorRequest, TutorResponse,
)

router = APIRouter(tags=["AI Tutor"])


@router.post("/tutor/message", response_model=TutorResponse)
async def tutor_message(request: TutorRequest, db: Session = Depends(get_db), owner_id: str = Depends(require_user)):
    context = service.resolve_context(db, request, owner_id)
    reserve_ai_request(db, owner_id)
    lesson = await tutor_ai.generate_lesson(context)
    return {
        "subject": context["subject"], "topic": context["topic"],
        "student_level": request.student_level, "action": request.action, "lesson": lesson,
    }


def replay_generation(db, existing, fingerprint):
    if existing.request_fingerprint != fingerprint:
        raise HTTPException(409, "Этот запрос уже использован для другой темы. Начни новый тест.")
    return service.public_test(db, existing)


@router.post("/mini-tests", response_model=PublicTest, status_code=201)
async def create_mini_test(request: MiniTestCreate, db: Session = Depends(get_db), owner_id: str = Depends(require_user)):
    fingerprint = service.request_fingerprint(request)
    existing = db.query(MiniTest).filter_by(request_id=str(request.request_id), owner_id=owner_id).first()
    # Проверяется до чтения текущего задания: повтор возвращает исходный снимок.
    if existing:
        return replay_generation(db, existing, fingerprint)
    context = service.resolve_context(db, request, owner_id)
    reserve_ai_request(db, owner_id)
    model = tutor_ai.configured_model()
    generated = await tutor_ai.generate_test(context)
    test = MiniTest(
        id=str(uuid4()), owner_id=owner_id, request_id=str(request.request_id), request_fingerprint=fingerprint,
        subject=context["subject"], topic=context["topic"],
        topic_key=service.topic_key(context["subject"], context["topic"]),
        student_level=request.student_level, source_task_id=request.task_id,
        task_description=context["task_description"], title=generated.title,
        questions_json=generated.model_dump_json(), model=model, schema_version=1,
        created_at=service.utc_now(),
    )
    db.add(test)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(MiniTest).filter_by(request_id=str(request.request_id), owner_id=owner_id).first()
        if existing is None:
            raise HTTPException(503, "Не удалось сохранить тест. Повтори попытку.") from None
        return replay_generation(db, existing, fingerprint)
    return service.public_test(db, test)


@router.get("/mini-tests", response_model=list[TestSummary])
def list_mini_tests(
    limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    owner_id: str = Depends(require_user),
):
    rows = db.query(MiniTest, TestResult).outerjoin(
        TestResult, MiniTest.id == TestResult.test_id,
    ).filter(MiniTest.owner_id == owner_id).order_by(MiniTest.created_at.desc(), MiniTest.id).offset(offset).limit(limit).all()
    return [service.test_summary(test, result) for test, result in rows]


def require_test(db, test_id, owner_id):
    test = db.query(MiniTest).filter_by(id=test_id, owner_id=owner_id).first()
    if test is None:
        raise HTTPException(404, "Тест не найден")
    return test


@router.get("/mini-tests/{test_id}", response_model=PublicTest)
def read_mini_test(test_id: str, db: Session = Depends(get_db), owner_id: str = Depends(require_user)):
    return service.public_test(db, require_test(db, test_id, owner_id))


def replay_submission(db, test, result, selections):
    if service.existing_selections(db, test.id) != selections:
        raise HTTPException(409, "Тест уже сдан. Для новой попытки начни новый мини-тест.")
    return service.result_detail(db, test, result)


@router.post("/mini-tests/{test_id}/submit", response_model=SavedResult)
def submit_test(test_id: str, submission: TestSubmission, db: Session = Depends(get_db), owner_id: str = Depends(require_user)):
    test = require_test(db, test_id, owner_id)
    selections = {answer.question_id: answer.choice_id for answer in submission.answers}
    existing = db.get(TestResult, test_id)
    if existing:
        return replay_submission(db, test, existing, selections)
    answers = service.grade_answers(test, selections)
    correct = sum(answer.is_correct for answer in answers)
    result = TestResult(
        test_id=test_id, correct_count=correct, total_count=5, score_percent=correct * 20,
        grading_version=service.GRADING_VERSION, completed_at=service.utc_now(),
    )
    db.add(result)
    # Явный flush сохраняет родительскую строку до дочерних в одной транзакции.
    try:
        db.flush()
        db.add_all(answers)
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.get(TestResult, test_id)
        if existing is None:
            raise HTTPException(503, "Не удалось сохранить результат. Твои ответы можно отправить снова.") from None
        return replay_submission(db, test, existing, selections)
    return service.result_detail(db, test, result)


@router.get("/test-results", response_model=list[TestSummary])
def list_results(
    topic_key: str | None = Query(None, max_length=40),
    limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    owner_id: str = Depends(require_user),
):
    query = db.query(MiniTest, TestResult).join(TestResult, MiniTest.id == TestResult.test_id).filter(MiniTest.owner_id == owner_id)
    if topic_key:
        query = query.filter(MiniTest.topic_key == topic_key)
    return [service.test_summary(test, result) for test, result in query.order_by(
        TestResult.completed_at.desc(), MiniTest.id,
    ).offset(offset).limit(limit).all()]


@router.get("/test-results/{test_id}", response_model=SavedResult)
def read_result(test_id: str, db: Session = Depends(get_db), owner_id: str = Depends(require_user)):
    test = require_test(db, test_id, owner_id)
    result = db.get(TestResult, test_id)
    if result is None:
        raise HTTPException(404, "Этот тест ещё не сдан")
    return service.result_detail(db, test, result)
