"""React и существующий FastAPI на одном домене; схема SQLite не меняется."""
from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .main import app as api
from .database import engine


def create_app():
    default_directory = Path(__file__).resolve().parents[2] / "dist"
    directory = Path(os.environ.get("STUDYFLOW_STATIC_DIR", str(default_directory)))
    if not (directory / "index.html").is_file():
        raise RuntimeError("Frontend не собран: проверь STUDYFLOW_STATIC_DIR.")

    @asynccontextmanager
    async def lifespan(_app):
        if not os.environ.get("NEON_AUTH_BASE_URL") or not os.environ.get("NEON_AUTH_JWKS_URL"):
            raise RuntimeError("Для размещённого приложения нужно настроить Neon Auth.")
        if os.environ.get("STUDYFLOW_REQUIRE_POSTGRES", "false").lower() == "true" and engine.dialect.name != "postgresql":
            raise RuntimeError("Для публичных аккаунтов нужна постоянная база PostgreSQL.")
        async with api.router.lifespan_context(api):
            yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.mount("/api", api)
    app.mount("/", StaticFiles(directory=directory, html=True))
    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if response.headers.get("content-type", "").startswith("text/html"):
            response.headers["Cache-Control"] = "no-store"
        return response
    return app
