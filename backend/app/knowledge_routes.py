from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .database import get_db
from .knowledge_map import build_knowledge_map
from .knowledge_schemas import KnowledgeMapResponse
from .auth import require_user

router = APIRouter(tags=["Knowledge Map"])


@router.get("/knowledge-map", response_model=KnowledgeMapResponse)
def read_knowledge_map(db: Session = Depends(get_db), owner_id: str = Depends(require_user)):
    return build_knowledge_map(db, owner_id)
