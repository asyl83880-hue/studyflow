"""Release checks against the mounted production API and an isolated SQLite DB.

Only OpenAI HTTP is replaced in the learning flow; parsing, grading and storage
run through the real application code.
"""
from datetime import datetime, timedelta, timezone
from io import BytesIO
import json
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient
from PIL import Image
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.app import main
from backend.app.database import Base, configure_sqlite, get_db
from backend.app.hosted import create_app


@pytest.fixture
def production(tmp_path, monkeypatch):
    monkeypatch.setenv("STUDYFLOW_DEMO_ACCESS_CODE", "release-test-access")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text('<html lang="ru">StudyFlow</html>')
    monkeypatch.setenv("STUDYFLOW_STATIC_DIR", str(static))
    db_engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    event.listen(db_engine, "connect", configure_sqlite)
    sessions = sessionmaker(bind=db_engine)
    monkeypatch.setattr(main, "engine", db_engine)

    def database():
        with sessions() as session:
            yield session

    main.app.dependency_overrides[get_db] = database
    try:
        with TestClient(create_app()) as client:
            yield client
    finally:
        main.app.dependency_overrides.clear()
        Base.metadata.drop_all(db_engine)
        db_engine.dispose()


@pytest.fixture
def authorized(production):
    production.headers["X-StudyFlow-Access-Code"] = "release-test-access"
    return production


def task_data(**changes):
    return {
        "subject": "Алгебра", "topic": "Линейные уравнения",
        "description": "Решить уравнения", "difficulty": "medium",
        "estimated_time": 45,
        "deadline": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
        **changes,
    }


def png():
    output = BytesIO()
    Image.new("RGB", (40, 30), "white").save(output, format="PNG")
    return output.getvalue()


def test_public_home_health_and_protected_data(production):
    assert production.get("/").status_code == 200
    assert production.get("/api/health").json() == {"status": "ok"}
    for path in ["/api/tasks", "/api/knowledge-map", "/api/mini-tests", "/api/access/check"]:
        assert production.get(path).status_code == 401
    assert production.get("/api/tasks", headers={"X-StudyFlow-Access-Code": "wrong"}).status_code == 401
    assert production.get("/missing.js").status_code == 404


def test_hosted_start_fails_without_private_access_code(production, monkeypatch):
    monkeypatch.delenv("STUDYFLOW_DEMO_ACCESS_CODE")
    with pytest.raises(RuntimeError, match="STUDYFLOW_DEMO_ACCESS_CODE"):
        with TestClient(create_app()):
            pass


def test_hosted_start_fails_without_build(production, monkeypatch, tmp_path):
    monkeypatch.setenv("STUDYFLOW_STATIC_DIR", str(tmp_path / "missing"))
    with pytest.raises(RuntimeError, match="Frontend"):
        create_app()


def test_crud_deadline_and_completed_tasks_leave_plan(authorized):
    created = authorized.post("/api/tasks", json=task_data(deadline="2030-01-01T18:00:00+05:00"))
    assert created.status_code == 201, created.text
    task = created.json()
    assert task["deadline"] == "2030-01-01T13:00:00+00:00"
    assert authorized.get("/api/tasks").json()[0]["id"] == task["id"]
    assert authorized.put(f'/api/tasks/{task["id"]}', json={"topic": "Новая тема"}).json()["topic"] == "Новая тема"
    assert authorized.patch(f'/api/tasks/{task["id"]}/complete').json()["completed"] is True
    plan = authorized.post("/api/planner/preview", json={"timezone": "Asia/Almaty"}).json()
    assert plan["pending_tasks"] == 0
    assert authorized.delete(f'/api/tasks/{task["id"]}').status_code == 200
    assert authorized.get("/api/tasks").json() == []


def test_create_retries_never_duplicate_or_recreate_deleted_task(authorized):
    headers = {"Idempotency-Key": str(uuid4())}
    body = task_data()
    first = authorized.post("/api/tasks", json=body, headers=headers).json()
    assert authorized.post("/api/tasks", json=body, headers=headers).json()["id"] == first["id"]
    assert len(authorized.get("/api/tasks").json()) == 1
    assert authorized.post("/api/tasks", json={**body, "topic": "Другая"}, headers=headers).status_code == 409
    authorized.delete(f'/api/tasks/{first["id"]}')
    assert authorized.post("/api/tasks", json=body, headers=headers).status_code == 409


@pytest.mark.parametrize("changes", [{"subject": ""}, {"deadline": "wrong"}, {"estimated_time": 0}, {"difficulty": True}])
def test_invalid_task_does_not_write(authorized, changes):
    assert authorized.post("/api/tasks", json=task_data(**changes)).status_code == 422
    assert authorized.get("/api/tasks").json() == []


def test_image_validation_and_missing_ai_are_recoverable(authorized):
    result = authorized.post("/api/ai/validate-image", files={"file": ("task.png", png(), "image/png")})
    assert result.status_code == 200
    assert result.json()["width"] == 40
    assert authorized.post("/api/ai/validate-image", files={"file": ("task.png", b"broken", "image/png")}).status_code == 422
    assert authorized.post("/api/ai/recognize", files={"file": ("task.png", png(), "image/png")}).status_code == 503
    assert authorized.post("/api/tutor/message", json={"subject": "Алгебра", "topic": "Уравнения", "action": "explain"}).status_code == 503
    assert authorized.get("/api/tasks").json() == []


def test_full_photo_plan_tutor_test_and_knowledge_flow(authorized, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-only-not-a-real-key")
    outgoing = []

    def openai(request):
        body = json.loads(request.content)
        assert str(request.url) == "https://api.openai.com/v1/responses"
        assert body["store"] is False
        name = body["text"]["format"]["name"]
        outgoing.append(name)
        if name == "studyflow_task_draft":
            data = {
                "has_task": True, "subject": "Алгебра", "topic": "Линейные уравнения",
                "description": "Решить уравнения", "deadline": "в понедельник",
                "deadline_date": None, "deadline_time": None,
                "uncertain_fields": ["deadline"], "warnings": [], "raw_text": "Алгебра, в понедельник",
            }
        elif name == "studyflow_lesson":
            data = {"title": "Решаем уравнения", "body": "Сохраняй равенство обеих частей.",
                    "steps": ["Перенеси свободное слагаемое."], "example": None, "exercise": None, "check": None}
        else:
            assert name == "studyflow_mini_test"
            data = {"title": "Уравнения", "questions": [{
                "prompt": f"Найди x: x + {i} = {i + 2}", "concept_label": "Перенос слагаемых",
                "choices": [{"text": str(j), "feedback": "Верно." if j == 2 else "Проверь перенос слагаемого.",
                             "error_type": "none" if j == 2 else "calculation"} for j in range(1, 5)],
                "correct_index": 1, "explanation": "Вычти одинаковое число из обеих частей.",
            } for i in range(1, 6)]}
        return httpx.Response(200, json={"status": "completed", "output": [{"type": "message", "content": [
            {"type": "output_text", "text": json.dumps(data, ensure_ascii=False)}]}]})

    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(openai)))
    draft = authorized.post("/api/ai/recognize", files={"file": ("task.png", png(), "image/png")})
    assert draft.status_code == 200, draft.text
    assert draft.json()["deadline_date"] is None
    assert "deadline" in draft.json()["uncertain_fields"]
    assert authorized.get("/api/tasks").json() == []  # Recognition never saves.
    task = authorized.post("/api/tasks", json=task_data()).json()
    plan = authorized.post("/api/planner/preview", json={"timezone": "Asia/Almaty"}).json()
    assert plan["planned_minutes"] == 45
    assert all(session["minutes"] <= 30 for day in plan["days"] for session in day["sessions"])
    context = {"subject": task["subject"], "topic": task["topic"], "task_id": task["id"]}
    assert authorized.post("/api/tutor/message", json={**context, "action": "explain"}).status_code == 200
    test_request = {**context, "request_id": str(uuid4())}
    response = authorized.post("/api/mini-tests", json=test_request)
    assert response.status_code == 201, response.text
    test = response.json()
    assert len(test["questions"]) == 5
    assert "correct_index" not in response.text and "feedback" not in response.text
    assert authorized.post("/api/mini-tests", json=test_request).json()["id"] == test["id"]
    answers = {"answers": [{"question_id": f"q{i}", "choice_id": "B" if i < 5 else "A"} for i in range(1, 6)]}
    submission_url = f'/api/mini-tests/{test["id"]}/submit'
    saved = authorized.post(submission_url, json=answers)
    assert saved.status_code == 200, saved.text
    assert saved.json()["score_percent"] == 80
    assert saved.json()["problem_topics"][0]["incorrect_count"] == 1
    assert authorized.post(submission_url, json=answers).json() == saved.json()
    answers["answers"][0]["choice_id"] = "A"
    assert authorized.post(submission_url, json=answers).status_code == 409
    knowledge = authorized.get("/api/knowledge-map").json()
    assert knowledge["summary"]["completed_tests"] == 1
    topic = knowledge["subjects"][0]["topics"][0]
    assert topic["label"] == task["topic"]
    assert topic["score_percent"] == 80
    assert topic["recommendation"]["steps"]
    # Persisted snapshots survive deleting the source assignment.
    authorized.delete(f'/api/tasks/{task["id"]}')
    assert authorized.get(f'/api/test-results/{test["id"]}').json() == saved.json()
    assert outgoing == ["studyflow_task_draft", "studyflow_lesson", "studyflow_mini_test"]
