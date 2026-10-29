# PROJECT STATE — StudyFlow

Дата: 29 октября 2026. Стадия: MVP и production Docker проверены; публичный запуск ещё не подтверждён.

## Источник

GitHub: https://github.com/asyl83880-hue/studyflow, ветка main. Репозиторий публичный.
Проверенный код: commit 99d6275f996ecd3066c9c6eedc6b8327bb44c82f.
Render: существующий сервис srv-db3uichsrm7s73a9aseg.
Фактический публичный URL и успешный Live пока не подтверждены.

## Стек и структура

React 19.3, Vite 8.3.2, Node 24; Python 3.12, FastAPI, SQLite/SQLAlchemy.
OpenAI Responses API: gpt-4o-mini по умолчанию; ключ только на сервере, store=false.

```text
src/{App.jsx,main.jsx,api.js,styles.css}
src/components/    Dashboard, Calendar, SmartPlanner, AITutor, KnowledgeMap,
                   StartPage, HostingAccess, формы, MiniTest, TestResult, UI
src/utils/         dates, difficulty
src/assets/fonts/  Manrope + лицензия
public/favicon.svg
backend/app/       main, hosted, hosting_access, database, models, schemas, crud,
                   image_uploads, photo_tasks, ai_schemas, ai_recognition,
                   task_estimation, planner, planner_routes,
                   tutor_schemas, tutor_ai, mini_tests, tutor_routes,
                   knowledge_schemas, knowledge_map, knowledge_routes
backend/tests/test_release.py
tests/api.test.mjs
demo/assignment.png
Dockerfile, render.yaml, .github/workflows/ci.yml
```

## Что работает

- Задания: CRUD, дедлайны в UTC, оценки сложности/времени, защита повторного создания.
- Dashboard и Calendar автоматически отражают задания.
- Фото JPG/PNG/WEBP → preview → AI-черновик → редактирование → подтверждение.
  Распознавание не создаёт запись; неизвестный/относительный срок требует выбора даты.
- Smart Planner: короткие блоки до 30 минут, дедлайны, часовой пояс, предупреждения.
- Tutor: explain/example/easy_exercise/harder_exercise/check_answer.
- Mini Test: пять вопросов, скрытый ключ, проверка сервером, защита повтора сдачи.
- Knowledge Map: предмет → тема → навык, пять статусов, последние попытки и рекомендации.
- Современная адаптивная оболочка, состояния загрузки, пустых данных и ошибок.

Главная публичная страница доступна без кода. При входе в размещённое демо нужен код:
задания и результаты общие. Это один демоученик, отдельных аккаунтов нет.

## База

Пять таблиц: tasks, task_create_requests, mini_tests, test_results, test_answers.
SQLite: foreign_keys=ON, busy_timeout=5000. Результат и ответы сохраняются атомарно.
Удаление задания не удаляет исторические снимки тестов.
Локальная БД: backend/studyflow.db; адрес переопределяется STUDYFLOW_DATABASE_URL.
Фото обрабатываются в памяти и не сохраняются.

## API

В локальном режиме без префикса; в размещённом режиме с `/api`:

- GET /health, GET /access/check.
- GET/POST /tasks; PUT/DELETE /tasks/{id}; PATCH /tasks/{id}/complete.
- POST /tasks/estimate; POST /planner/preview.
- POST /ai/validate-image; POST /ai/recognize.
- POST /tutor/message.
- GET/POST /mini-tests; GET /mini-tests/{id}; POST /mini-tests/{id}/submit.
- GET /test-results; GET /test-results/{id}; GET /knowledge-map.

## Размещение

Один Docker Web Service: React + API на одном домене.
Docker собирает корневой React-проект с VITE_API_URL=/api и защитой демо.
Обязателен STUDYFLOW_DEMO_ACCESS_CODE. AI требует действующий OPENAI_API_KEY.
Код и ключ хранятся в Render, а не в GitHub.

render.yaml: Free, Frankfurt, без диска, SQLite /tmp/studyflow.db,
health check /api/health. Бесплатный сервис может засыпать;
SQLite очищается при перезапуске/развёртывании. Пользователь ранее выбрал этот режим.
Изменения YAML не заменяют ручные настройки уже созданного сервиса.

## Проверки

Локально проходят 5 Node-проверок и 11 backend-проверок.
Локально проходит production-сборка frontend.
Backend-проверка выполняет полный цикл фото → план → Tutor → тест → результат → карта;
заменён только внешний OpenAI HTTP, реальный ключ/квота этим не проверяются.
GitHub CI собирает frontend, проверяет backend и собирает production Docker-образ.
Удалённый CI полностью прошёл: frontend, backend, Docker build и запуск контейнера.
В контейнере проверены публичная страница, /api/health, запрет данных без кода и доступ с кодом.
Результат: https://github.com/asyl83880-hue/studyflow/actions/runs/40827929480.
В браузере просмотрены главная страница и форма доступа; полный браузерный цикл не подтверждён.
Реальные OpenAI и Live Render ещё не проверены.

## Что осталось

1. Получить доступ к управлению существующим сервисом Render: установка подключения
   подтверждена, но его команды в этой сессии не появились. Не просить установить заново.
2. Проверить настройки/секреты сервиса и развернуть исправленную версию.
3. Дождаться Live, проверить фактическую ссылку и реальный учебный цикл с OpenAI.
4. Записать подтверждённую ссылку и актуальный статус в этот файл.

Граница MVP: нет личных кабинетов, постоянного облачного хранилища на Free,
восстановления черновика формы после reload или серверного сохранения расписания.
