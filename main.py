from contextlib import asynccontextmanager
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
from .hosting_access import DemoAccessMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="StudyFlow API", lifespan=lifespan)

app.add_middleware(DemoAccessMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(photo_router)
app.include_router(planner_router)
app.include_router(tutor_router)
app.include_router(knowledge_router)


@app.exception_handler(SQLAlchemyError)
async def database_error(_request, _error):
    # Не отдаём SQL, путь базы и входные данные. get_db закроет/откатит сессию.
    return JSONResponse(status_code=503, content={
        "detail": "Не удалось обратиться к базе данных. Проверь доступ к файлу базы и повтори попытку. Введённые данные сохранены.",
    })


@app.get("/")
def root():
    return {"message": "StudyFlow API работает"}


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get("/access/check")
def check_access():
    return {"status": "ok"}


@app.post("/tasks", response_model=schemas.TaskResponse, status_code=201)
def create_task(task: schemas.TaskCreate, db: Session = Depends(get_db),
                idempotency_key: UUID | None = Header(default=None)):
    return crud.create_task(db, task, str(idempotency_key) if idempotency_key else None)


@app.get("/tasks", response_model=list[schemas.TaskResponse])
def read_tasks(db: Session = Depends(get_db)):
    return crud.get_tasks(db)


@app.put("/tasks/{task_id}", response_model=schemas.TaskResponse)
def update_task(task_id: int, task: schemas.TaskUpdate, db: Session = Depends(get_db)):
    updated = crud.update_task(db, task_id, task)
    if not updated:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    return updated


@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    deleted = crud.delete_task(db, task_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    return {"message": "Задание удалено"}


@app.patch("/tasks/{task_id}/complete", response_model=schemas.TaskResponse)
def complete_task(task_id: int, db: Session = Depends(get_db)):
    completed = crud.complete_task(db, task_id)
    if not completed:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    return completed
