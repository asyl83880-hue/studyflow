FROM node:24-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY src/ ./src/
COPY public/ ./public/
RUN VITE_API_URL=/api VITE_REQUIRE_ACCESS_CODE=true npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    STUDYFLOW_STATIC_DIR=/app/frontend \
    STUDYFLOW_DATABASE_URL=sqlite:////var/data/studyflow.db
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app/ ./app/
COPY --from=frontend /build/frontend/dist/ /app/frontend/
COPY demo/assignment.png /app/frontend/demo/assignment.png
RUN mkdir -p /var/data
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app.hosted:create_app --factory --host 0.0.0.0 --port ${PORT:-8000}"]
