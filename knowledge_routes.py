from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .database import get_db
from .knowledge_map import build_knowledge_map
from .knowledge_schemas import KnowledgeMapResponse

router = APIRouter(tags=["Knowledge Map"])


@router.get("/knowledge-map", response_model=KnowledgeMapResponse)
def read_knowledge_map(db: Session = Depends(get_db)):
    return build_knowledge_map(db)
