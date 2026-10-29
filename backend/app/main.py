from contextlib import asynccontextmanager
import os
from uuid import UUID

from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import text
from sqlalchemy.orm import Session

from . import models, schemas, crud
from .database import Base, engine, get_db
from .photo_tasks import router as photo_router
from .planner_routes import router as planner_router
from .tutor_routes import router as tutor_router
from .knowledge_routes import router as knowledge_router
from .auth import require_user, auth_url


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="StudyFlow API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(photo_router, dependencies=[Depends(require_user)])
app.include_router(planner_router, dependencies=[Depends(require_user)])
app.include_router(tutor_router, dependencies=[Depends(require_user)])
app.include_router(knowledge_router, dependencies=[Depends(require_user)])


@app.middleware("http")
async def private_responses(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(SQLAlchemyError)
async def database_error(_request, _error):
    # Не отдаём SQL, путь базы и входные данные. get_db закроет/откатит сессию.
    return JSONResponse(status_code=503, content={
        "detail": "Хранилище временно недоступно. Повтори попытку — введённые данные остались в форме.",
    })


@app.get("/")
def root():
    return {"message": "StudyFlow API работает"}


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get("/config")
def config():
    return {
        "auth_url": auth_url() or None,
        "ai_ready": bool(os.environ.get("OPENAI_API_KEY", "").strip()),
        "persistent_storage": engine.dialect.name == "postgresql",
    }


@app.get("/auth/me")
def me(owner_id: str = Depends(require_user)):
    return {"id": owner_id}


@app.post("/tasks", response_model=schemas.TaskResponse, status_code=201)
def create_task(task: schemas.TaskCreate, db: Session = Depends(get_db),
                idempotency_key: UUID | None = Header(default=None), owner_id: str = Depends(require_user)):
    return crud.create_task(db, task, owner_id, str(idempotency_key) if idempotency_key else None)


@app.get("/tasks", response_model=list[schemas.TaskResponse])
def read_tasks(db: Session = Depends(get_db), owner_id: str = Depends(require_user)):
    return crud.get_tasks(db, owner_id)


@app.put("/tasks/{task_id}", response_model=schemas.TaskResponse)
def update_task(task_id: int, task: schemas.TaskUpdate, db: Session = Depends(get_db), owner_id: str = Depends(require_user)):
    updated = crud.update_task(db, task_id, task, owner_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    return updated


@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db), owner_id: str = Depends(require_user)):
    deleted = crud.delete_task(db, task_id, owner_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    return {"message": "Задание удалено"}


@app.patch("/tasks/{task_id}/complete", response_model=schemas.TaskResponse)
def complete_task(task_id: int, db: Session = Depends(get_db), owner_id: str = Depends(require_user)):
    completed = crud.complete_task(db, task_id, owner_id)
    if not completed:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    return completed
