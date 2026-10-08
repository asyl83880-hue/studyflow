import hashlib
import json

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from . import models, schemas


def replay_task_creation(db, request, fingerprint):
    if request.fingerprint != fingerprint:
        raise HTTPException(409, "Этот запрос уже использован с другими данными. Открой новую форму задания.")
    existing = db.get(models.Task, request.task_id) if request.task_id is not None else None
    if existing is None:
        raise HTTPException(409, "Это задание уже удалено. Для нового задания открой новую форму.")
    return existing


def create_task(db: Session, task: schemas.TaskCreate, request_id=None):
    fingerprint = hashlib.sha256(json.dumps(
        task.model_dump(mode="json"), ensure_ascii=False, sort_keys=True,
    ).encode("utf-8")).hexdigest()
    if request_id:
        existing = db.get(models.TaskCreateRequest, request_id)
        if existing:
            return replay_task_creation(db, existing, fingerprint)
    db_task = models.Task(**task.model_dump())
    db.add(db_task)
    try:
        if request_id:
            db.flush()
            db.add(models.TaskCreateRequest(
                request_id=request_id, fingerprint=fingerprint, task_id=db_task.id,
            ))
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.get(models.TaskCreateRequest, request_id) if request_id else None
        if existing is None:
            raise HTTPException(503, "Не удалось сохранить задание. Повтори попытку.") from None
        return replay_task_creation(db, existing, fingerprint)
    db.refresh(db_task)
    return db_task


def get_tasks(db: Session):
    return db.query(models.Task).order_by(models.Task.deadline.asc(), models.Task.id.asc()).all()


def get_task(db: Session, task_id: int):
    return db.query(models.Task).filter(models.Task.id == task_id).first()


def update_task(db: Session, task_id: int, task: schemas.TaskUpdate):
    db_task = get_task(db, task_id)
    if not db_task:
        return None

    data = task.model_dump(exclude_unset=True)

    for key, value in data.items():
        setattr(db_task, key, value)

    db.commit()
    db.refresh(db_task)
    return db_task


def delete_task(db: Session, task_id: int):
    db_task = get_task(db, task_id)
    if not db_task:
        return None

    db.delete(db_task)
    db.commit()
    return db_task


def complete_task(db: Session, task_id: int):
    db_task = get_task(db, task_id)
    if not db_task:
        return None

    db_task.completed = True
    db.commit()
    db.refresh(db_task)
    return db_task
