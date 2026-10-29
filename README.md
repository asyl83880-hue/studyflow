# StudyFlow

Персональный AI-навигатор школьника: задания, календарь, Smart Planner, Tutor,
мини-тесты и карта знаний.

Существующий сайт: https://studyflow-27y8.onrender.com

## Версия с личными аккаунтами

Ветка `accounts-and-storage` готовит переход от общего демо к личным аккаунтам.
До настройки Neon и слияния этой ветки опубликованный сайт остаётся прежним демо.

- Регистрация, вход, выход, подтверждение почты и восстановление пароля — Neon Auth.
- FastAPI проверяет короткий JWT по подписи Ed25519, issuer и сроку действия.
- Задания, тесты, результаты, карта знаний и настройки браузера разделены по пользователям.
- Хранилище — отдельный PostgreSQL в Neon; перезапуск Render не удаляет такую базу.
- OpenAI-ключ остаётся на сервере; AI имеет дневные лимиты на пользователя и на весь сервис.

## Стек

React 19 / Vite / Node 24; FastAPI / Python 3.12 / SQLAlchemy;
Neon PostgreSQL через psycopg; Managed Neon Auth; OpenAI Responses API.
SQLite доступен для изолированных тестов и локальной разработки.

## Запуск

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r backend/requirements-dev.txt
npm ci
```

Скопируй `backend/.env.example` в `backend/.env` и заполни настройки своей ветки Neon.
Пароль базы и OPENAI_API_KEY нельзя загружать в GitHub.

В двух терминалах из корня проекта:

```bash
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

```bash
npm run dev
```

Открой http://127.0.0.1:5173. В Neon Auth разреши origin этого интерфейса.
Сервер берёт публичный Auth URL из своей конфигурации, отдельный VITE-ключ не нужен.

## Проверки

```bash
python -m pytest backend/tests -q
npm test
npm run build
```

CI дополнительно выполняет те же API-проверки на PostgreSQL 17 и собирает Docker.
В автоматическом учебном цикле заменён только внешний HTTP OpenAI.
Реальные Neon Auth, доставка писем и OpenAI должны быть проверены после настройки провайдеров.

Подготовка публикации и порядок переключения: [HOSTING_GUIDE.md](HOSTING_GUIDE.md).
Актуальный статус: [PROJECT_STATE.md](PROJECT_STATE.md).
