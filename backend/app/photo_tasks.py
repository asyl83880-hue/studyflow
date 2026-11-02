from fastapi import APIRouter, File, UploadFile, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .image_uploads import read_image
from .ai_schemas import RecognizedTask
from .ai_recognition import recognize_image
from .auth import require_user
from .database import get_db
from .usage import reserve_ai_request
from .ai_config import provider_name

router = APIRouter(prefix="/ai", tags=["Фото задания"])


@router.post("/validate-image")
async def validate_image(file: UploadFile = File(...)):
    """Проверка загрузки без API-ключа и без создания задания."""
    image = await read_image(file)
    return {
        "valid": True,
        "format": image.original_format,
        "width": image.width,
        "height": image.height,
        "size_bytes": image.original_size,
    }


@router.post("/recognize", response_model=RecognizedTask)
async def recognize_task(file: UploadFile = File(...), db: Session = Depends(get_db), owner_id: str = Depends(require_user),
                         ai_provider: str | None = Header(default=None, alias="X-StudyFlow-AI-Provider", max_length=16)):
    """Возвращает только черновик. POST /tasks вызывается после подтверждения в UI."""
    selected = provider_name()
    if (selected == "cloudflare" or ai_provider is not None) and ai_provider != selected:
        raise HTTPException(409, "Сервис распознавания изменился. Обнови страницу и проверь, куда будет отправлено фото.")
    image = await read_image(file)
    reserve_ai_request(db, owner_id)
    return await recognize_image(image)
