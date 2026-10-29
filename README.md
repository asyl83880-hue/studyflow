# StudyFlow

Персональный AI-навигатор школьника: задания, календарь, Smart Planner, Tutor,
мини-тесты и карта знаний.

Существующий сайт: https://studyflow-27y8.onrender.com

## Версия с личными аккаунтами

Версия с личными аккаунтами опубликована на Render и использует постоянный Neon PostgreSQL.
Регистрация, разделение данных и сохранение задания после повторного развёртывания проверены.

**Текущий блокер AI:** OpenAI возвращает `429 credit_balance_exhausted`. Владельцу нужно
восстановить баланс API; до этого распознавание, Tutor и генерация мини-тестов недоступны.

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
Реальный Neon Auth проверен. Доставка почтовых кодов ещё не подтверждена,
а полный цикл с настоящим OpenAI заблокирован балансом API.
Актуальный CI: https://github.com/asyl83880-hue/studyflow/actions/runs/40910044921.

Подготовка публикации и порядок переключения: [HOSTING_GUIDE.md](HOSTING_GUIDE.md).
Актуальный статус: [PROJECT_STATE.md](PROJECT_STATE.md).
