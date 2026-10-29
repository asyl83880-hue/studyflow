# Публикация StudyFlow на Render

## Один сервис

Docker собирает React из `src/` и запускает существующий FastAPI.
Страница и API находятся на одном домене; API имеет префикс `/api`.
Отдельные Vercel, CORS-настройки и второй backend не требуются.

`render.yaml` задаёт бесплатный Docker Web Service без постоянного диска.
SQLite находится в `/tmp/studyflow.db` и очищается при новом развёртывании или
перезапуске. Это согласованный режим демонстрации, а не хранилище личных данных.

## Обновление существующего сервиса

Репозиторий: https://github.com/asyl83880-hue/studyflow, ветка `main`.
Существующий сервис: https://dashboard.render.com/web/srv-db3uichsrm7s73a9aseg.
Не создавай второй сервис, если этот уже связан с репозиторием.

Проверь настройки:

- Runtime: Docker; Dockerfile: `./Dockerfile`; Docker context: `.`.
- Root Directory: пусто (корень репозитория).
- Health Check: `/api/health`.
- Тариф: Free, без диска.
- Auto Deploy: после успешных CI-проверок либо On Commit.

Изменение YAML само по себе не меняет ручные настройки сервиса:
для существующего сервиса нужна синхронизация Blueprint или обновление настроек.

## Переменные окружения

| Переменная | Назначение |
| --- | --- |
| `OPENAI_API_KEY` | Секретный ключ OpenAI для фото, Tutor и генерации тестов. |
| `OPENAI_MODEL` | `gpt-4o-mini`, если не переопределено. |
| `STUDYFLOW_DEMO_ACCESS_CODE` | Длинный случайный приватный код общего демо. |
| `STUDYFLOW_DATABASE_URL` | `sqlite:////tmp/studyflow.db` для бесплатного сервиса. |

Код демо обязателен: сервер откажется запускаться без него. При создании через
Blueprint Render генерирует код; существующие значения нужно сохранить.
Ключ OpenAI и код никогда не записываются в репозиторий или frontend.
Настройка секретов выполняется в Environment существующего сервиса.

Docker уже собирает frontend с `VITE_API_URL=/api` и
`VITE_REQUIRE_ACCESS_CODE=true`; вручную задавать их для Docker не требуется.

## Проверка после Live

1. Открой фактическую ссылку сервиса, которую показывает Render.
2. Проверь публичную главную страницу и `/api/health` (`status: ok`).
3. Убедись, что `/api/tasks` без кода отвечает 401.
4. Войди с кодом и создай учебное задание; проверь календарь и Smart Planner.
5. Проверь фото → распознавание → исправление → подтверждение.
6. Открой тему → объяснение → мини-тест → результат → карта знаний.
7. Проверь новые runtime-логи на ошибки.

Без действующего ключа/квоты OpenAI AI-шаги возвращают понятное сообщение;
ручное добавление и планирование остаются доступны. Подписка ChatGPT Plus не
передаёт серверу проекта API-ключ.

## Локальная проверка production-режима

```bash
VITE_API_URL=/api VITE_REQUIRE_ACCESS_CODE=true npm run build
STUDYFLOW_DEMO_ACCESS_CODE=<private-code> python -m uvicorn backend.app.hosted:create_app --factory --host 0.0.0.0 --port 8000
```

В Windows задай эти переменные средствами PowerShell или CMD перед командами.
Для проверки самого контейнера: `docker build -t studyflow .`, затем запусти
его с секретами через переменные окружения и сопоставлением порта 8000.

Официальные сведения:
https://render.com/docs/deploys
https://render.com/docs/blueprint-spec
https://render.com/docs/free
