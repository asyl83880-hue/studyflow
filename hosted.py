"""React и существующий FastAPI на одном домене; схема SQLite не меняется."""
from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .main import app as api


def create_app():
    directory = Path(os.environ.get("STUDYFLOW_STATIC_DIR", "/app/frontend"))
    if not (directory / "index.html").is_file():
        raise RuntimeError("Frontend не собран: проверь STUDYFLOW_STATIC_DIR.")

    @asynccontextmanager
    async def lifespan(_app):
        if not os.environ.get("STUDYFLOW_DEMO_ACCESS_CODE"):
            raise RuntimeError("Для размещённого демо нужен STUDYFLOW_DEMO_ACCESS_CODE.")
        async with api.router.lifespan_context(api):
            yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.mount("/api", api)
    app.mount("/", StaticFiles(directory=directory, html=True))
    return app
