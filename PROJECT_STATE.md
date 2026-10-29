# PROJECT STATE — StudyFlow

Дата: 29 октября 2026. Стадия: MVP опубликован, публичная страница и сервер проверены.

## Источник

GitHub: https://github.com/asyl83880-hue/studyflow, ветка main. Репозиторий публичный.
Проверенный код: commit 99d6275f996ecd3066c9c6eedc6b8327bb44c82f.
Render: существующий сервис srv-db3uichsrm7s73a9aseg.
Публичный URL: https://studyflow-27y8.onrender.com.
Развёртывание dep-dbhe9fp5efls738ndoh0 имеет статус Live, source commit
20b77fc3c31c0dc9fc3f6f59544c5d3694953ab9 (код тот же, что у проверенного 99d6275).
Тариф Free, Docker, Frankfurt, health check /api/health, Auto Deploy On Commit.

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
Подтверждённые настройки существующего сервиса: Free, Docker, корень репозитория,
Dockerfile ./Dockerfile, health check /api/health. Его Auto Deploy остаётся On Commit;
заданный в YAML checksPass не применяется к этому сервису автоматически.
Текущее значение STUDYFLOW_DATABASE_URL не считывалось; Docker по умолчанию
использует /var/data/studyflow.db, тоже без постоянного хранения на Free.

## Проверки

Локально проходят 5 Node-проверок и 11 backend-проверок.
Локально проходит production-сборка frontend.
Backend-проверка выполняет полный цикл фото → план → Tutor → тест → результат → карта;
заменён только внешний OpenAI HTTP, реальный ключ/квота этим не проверяются.
GitHub CI собирает frontend, проверяет backend и собирает production Docker-образ.
Удалённый CI полностью прошёл: frontend, backend, Docker build и запуск контейнера.
В контейнере проверены публичная страница, /api/health, запрет данных без кода и доступ с кодом.
Результат: https://github.com/asyl83880-hue/studyflow/actions/runs/40827929480.
В браузере просмотрена фактическая публичная главная страница.
По публичной ссылке /api/health вернул status: ok; /api/tasks без кода вернул 401.
Live Render подтверждён, ошибок app-уровня error в доступных логах не найдено.
Полный браузерный цикл и реальные OpenAI-запросы ещё не проверены: для них нужен
существующий код доступа. Его значение и секрет OpenAI не считывались и не менялись.

## Что осталось

Публикация завершена. Для репетиции с настоящим AI:

1. Войти на опубликованный сайт с существующим кодом доступа автора
   (STUDYFLOW_DEMO_ACCESS_CODE в Environment сервиса Render).
2. Пройти фото → план → Tutor → мини-тест → результат → карта знаний.
3. При ошибке AI проверить серверный ключ/квоту OpenAI, не добавляя секрет в GitHub.

Render подключён; единственное пространство аккаунта — StudyFlow,
workspaceId tea-db3tnsmb7d7c739jl12g. Оба доступных подключения указывают на него.
Документационные обновления с [skip render] не должны запускать лишнюю сборку.

Граница MVP: нет личных кабинетов, постоянного облачного хранилища на Free,
восстановления черновика формы после reload или серверного сохранения расписания.
