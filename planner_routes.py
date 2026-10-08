from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from . import crud
from .database import get_db
from .planner import PlannerRequest, PlanResponse, build_plan
from .task_estimation import EstimateRequest, EstimateResponse, estimate_task

router = APIRouter(tags=["Smart Planner"])


def utc_now():
    return datetime.now(timezone.utc)


@router.post("/tasks/estimate", response_model=EstimateResponse)
def preview_estimate(data: EstimateRequest):
    # Никаких записей в базе: форма получает только предложение.
    return estimate_task(data)


@router.post("/planner/preview", response_model=PlanResponse)
def preview_plan(options: PlannerRequest, db: Session = Depends(get_db)):
    return build_plan(crud.get_tasks(db), options, utc_now())
