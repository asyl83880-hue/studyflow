"""Проверка фотографии в памяти. В базу и на диск изображения не сохраняются."""

from dataclasses import dataclass
from io import BytesIO
import warnings

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "application/octet-stream"}


@dataclass(frozen=True)
class PreparedImage:
    data: bytes
    width: int
    height: int
    original_size: int
    original_format: str
    mime_type: str = "image/jpeg"


def prepare_image(data: bytes) -> PreparedImage:
    if not data:
        raise HTTPException(400, "Файл пустой. Выбери другую фотографию.")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Изображение больше 10 МБ. Уменьши его размер.")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                original_format = image.format
                if original_format not in ALLOWED_FORMATS:
                    raise HTTPException(415, "Поддерживаются только JPG, PNG и WEBP.")
                if image.width * image.height > MAX_IMAGE_PIXELS:
                    raise HTTPException(413, "Фото слишком большое. Обрежь область с заданием.")
                if getattr(image, "is_animated", False):
                    raise HTTPException(415, "Выбери обычное фото или один скриншот без анимации.")
                image.verify()

            # Повторное открытие после verify; поворот камеры и удаление EXIF.
            with Image.open(BytesIO(data)) as source:
                image = ImageOps.exif_transpose(source).convert("RGBA")
                image.thumbnail((4096, 4096), Image.Resampling.LANCZOS)
                background = Image.new("RGB", image.size, "white")
                background.paste(image, mask=image.getchannel("A"))
                output = BytesIO()
                background.save(output, format="JPEG", quality=95)
                return PreparedImage(
                    data=output.getvalue(), width=background.width, height=background.height,
                    original_size=len(data), original_format=original_format,
                )
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(413, "Фото слишком большое. Обрежь область с заданием.") from None
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        raise HTTPException(422, "Не удалось открыть изображение. Выбери исправное фото.") from None


async def read_image(file: UploadFile) -> PreparedImage:
    try:
        if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(415, "Поддерживаются только JPG, PNG и WEBP.")
        # Читаем максимум лимит + 1 байт, а не весь потенциально большой файл.
        data = await file.read(MAX_IMAGE_BYTES + 1)
        return await run_in_threadpool(prepare_image, data)
    finally:
        await file.close()
