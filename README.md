# StudyFlow

AI-навигатор школьника: задания, дедлайны, учебный план, объяснения и карта знаний.

## Возможности

- Задания вручную или по фото; результат распознавания сохраняется только после подтверждения.
- Dashboard, календарь и Smart Planner с короткими учебными блоками.
- AI Tutor: объяснения, примеры, практика и проверка ответа.
- Мини-тест из пяти вопросов, разбор ошибок и Knowledge Map.

Стек: React + Vite, Python 3.12 + FastAPI, SQLite + SQLAlchemy, OpenAI Responses API.

## Структура

```text
src/                  React: App, components, utils, assets/fonts
public/               favicon
backend/app/          API, AI, planner, database, knowledge map
backend/tests/        проверки размещённого API и учебного цикла
tests/                проверки JS-клиента API
demo/assignment.png   учебное изображение
Dockerfile            React и API в одном контейнере
render.yaml           бесплатный Docker Web Service
PROJECT_STATE.md      актуальное состояние и ограничения
```

## Локальный запуск

Требуются Node.js 24 и Python 3.12.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r backend/requirements-dev.txt
npm ci
```

Скопируй `backend/.env.example` в `backend/.env` и добавь свой `OPENAI_API_KEY` для AI.
Значения не нужно загружать в GitHub. Без ключа работают задания, календарь и план.

В двух терминалах из корня проекта:

```bash
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

```bash
npm run dev
```

Интерфейс: http://127.0.0.1:5173. API: http://127.0.0.1:8000/docs.

## Проверки

```bash
npm test
npm run build
python -m pytest backend/tests -q
```

GitHub Actions также собирает настоящий Docker-образ. Подробности публикации: [HOSTING_GUIDE.md](HOSTING_GUIDE.md).

## Публичное демо

Главная страница открыта. Для общего демопространства нужен приватный код автора:
в текущем MVP задания и результаты общие, отдельных аккаунтов нет.
AI-ключ используется только на сервере. Не публикуй его в frontend или GitHub.
Бесплатный Render может засыпать; SQLite на бесплатном тарифе не переживает
перезапуск или новое развёртывание. Используй учебные данные.

Это MVP стартапа. Публичный запуск считается завершённым после статуса Live и
проверки фактического адреса; состояние публикации смотри в PROJECT_STATE.md.
