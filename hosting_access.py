"""Код доступа для общего демо; локальная установка без кода не меняется."""
import os
import secrets

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class DemoAccessMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.scope["path"]
        root_path = request.scope.get("root_path", "")
        if root_path and path.startswith(root_path):
            path = path[len(root_path):] or "/"
        key = os.environ.get("STUDYFLOW_DEMO_ACCESS_CODE", "")
        if key and request.method != "OPTIONS" and path not in ("/", "/health"):
            supplied = request.headers.get("X-StudyFlow-Access-Code", "")
            if not secrets.compare_digest(supplied.encode(), key.encode()):
                return JSONResponse(status_code=401, content={
                    "detail": "Код доступа неверный или изменился. Введи код, который передал автор проекта.",
                })
        return await call_next(request)
