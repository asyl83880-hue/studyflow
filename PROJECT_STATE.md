# PROJECT STATE — StudyFlow
Дата: 8 октября 2026. Этап: демо и подготовка постоянного размещения; облачное размещение ещё не выполнено.

## Стек и запуск
React 19.3 + JavaScript + Vite 8.3.2; Python 3.12+ + FastAPI; SQLite через SQLAlchemy.
Локальное приложение для одного ученика, без аккаунтов. Node.js 24 LTS рекомендован.
Подготовлено размещение на Render: React и FastAPI на одном домене через `/api`,
SQLite на постоянном диске. Это общее демо с кодом доступа, без отдельных личных кабинетов.
start_backend.bat → API http://127.0.0.1:8000 (/docs); start_frontend.bat → http://127.0.0.1:5173.
SQLite: backend/studyflow.db; путь не зависит от рабочей папки. Для проверки отдельной БД
можно задать STUDYFLOW_DATABASE_URL. BAT проверяют готовые зависимости без интернета;
при первом запуске или смене версий выполняют установку.

Фото, Tutor и генерация тестов: OpenAI Responses API, gpt-4o-mini по умолчанию,
строгий JSON Schema, store=false. OPENAI_API_KEY/OPENAI_MODEL в backend/.env локально,
на хостинге — в секретах/переменных окружения Render; ключ не попадает в frontend.
Оценка времени, Smart Planner, проверка Mini Test и Knowledge Map работают на Python
по правилам, без собственной ML-модели и дополнительных AI-запросов.
Свободный ответ в Tutor проверяет AI; результаты этой проверки в карту не входят.

## Структура
```text
StudyFlow/
  backend/
    app/ — main, database, models, schemas, crud
      hosted — React + API на одном домене; hosting_access — защита общего демо
      image_uploads, photo_tasks, ai_schemas, ai_recognition
      task_estimation, planner, planner_routes
      tutor_schemas, tutor_ai, mini_tests, tutor_routes
      knowledge_schemas, knowledge_map, knowledge_routes
    tests/ — tasks, photo_tasks, estimation, planner, tutor, knowledge_map, demo_hardening
    requirements.txt, requirements-dev.txt, check_dependencies.py, .env.example
  frontend/
    src/ — App.jsx, api.js, styles.css, main.jsx
      components/ — StartPage, Dashboard, Calendar, SmartPlanner, AITutor
        HostingAccess — экран кода доступа только для размещённой сборки
        MiniTest, TestResult, KnowledgeMap, TaskForm, PhotoTaskForm
        TaskEstimateFields, TaskList, TaskItem, UI, Drawer
      utils/ — dates.js, difficulty.js
      assets/fonts/ — локальный Manrope + лицензия
    public/favicon.svg, scripts/check-dependencies.cjs, tests/api.test.mjs
    package.json, package-lock.json, vite.config.js
  qa/ — отдельный mock-сервер, run_e2e.py, demo-flow.cjs, package.json/lock, README.md
    output/ — результаты 14 браузерных сценариев и скриншоты
  demo/assignment.png — пример изображения для репетиции
  start_backend.bat, start_frontend.bat, README.md
  Dockerfile, render.yaml, HOSTING_GUIDE.md — один Docker-сервер с диском 1 ГБ
  AUDIT.md, DAY8_GUIDE.md, DAY8_CHANGES.md, PROJECT_STATE.md
  DAY3..DAY7_GUIDE/CHANGES.md — прежние инструкции
```

## База данных
Пять таблиц. Base.metadata.create_all создаёт недостающие таблицы при старте.
Существующие колонки не меняются; .env и пользовательская база не входят в архивы.

- tasks: id, subject, topic, description, deadline (UTC), difficulty (целое 1–5),
  estimated_time (минуты), completed. API отдаёт easy/medium/hard: 1–2/3/4–5.
- mini_tests: UUID id, уникальный request_id, request_fingerprint; снимки subject,
  topic, topic_key, student_level, source_task_id, task_description, title;
  private questions_json, model, schema_version=1, created_at.
- test_results: test_id PK/FK → mini_tests; correct_count, total_count=5,
  score_percent, grading_version=single-choice-v1, completed_at.
- test_answers: PK (test_id, question_id), FK → test_results; selected_choice_id,
  is_correct, error_type, concept_key, concept_label, feedback.
- task_create_requests: request_id UUID PK, fingerprint SHA-256, task_id FK → tasks.
  Удаление задания ставит task_id=NULL; старый ключ не создаёт его заново.
  Таблица служебная, для защиты повторного сохранения после потери ответа.

SQLite включает foreign_keys=ON и busy_timeout=5000 на каждом соединении.
source_task_id теста — исторический номер, не FK: удаление/изменение задания не
меняет снимок теста и историю знаний. Результат и пять ответов сохраняются атомарно.

## API
| Метод | Путь | Действие |
| --- | --- | --- |
| GET | / | Состояние сервера |
| GET | /health | Проверка API и соединения с SQLite |
| GET | /access/check | Проверка кода доступа к демо |
| POST / GET | /tasks | Создать / список |
| PUT / DELETE | /tasks/{id} | Изменить / удалить |
| PATCH | /tasks/{id}/complete | Выполнить всё задание |
| POST | /tasks/estimate | Оценить без записи |
| POST | /planner/preview | План по текущей базе |
| POST | /ai/validate-image | Проверить загрузку без AI |
| POST | /ai/recognize | AI-черновик, без сохранения |
| POST | /tutor/message | Объяснение / пример / практика / проверка |
| POST / GET | /mini-tests | Создать / история |
| GET | /mini-tests/{id} | Публичные вопросы без ключа |
| POST | /mini-tests/{id}/submit | Проверить и сохранить |
| GET | /test-results | История результатов, topic_key/limit/offset |
| GET | /test-results/{id} | Разбор и диагностика |
| GET | /knowledge-map | Темы, навыки, статусы и рекомендации |

POST /tasks поддерживает необязательный UUID-заголовок Idempotency-Key. Совпавший
повтор возвращает исходное задание, другое тело с тем же ключом →409. UI сохраняет
UUID попытки до успешного ответа. Legacy-клиенты без заголовка продолжают работать.
Новые/изменяемые estimated_time: 1–43200 минут; старые ответы остаются совместимыми.
Ошибка SQLAlchemy →503 без SQL, пути базы и входных данных.

Tutor: subject/topic/student_level, optional task_id/focus_concept; actions:
explain/example/easy_exercise/harder_exercise/check_answer. Для проверки нужны
exercise_text + student_answer. При task_id контекст берётся из базы.
focus_concept — навык внутри исходной темы; все 5 вопросов фокусного теста имеют
тот же concept_label. Несогласованный AI-ответ отклоняется без записи.

MiniTestCreate требует UUID request_id. Повтор того же контекста возвращает снимок;
другой контекст с тем же UUID →409. До сдачи correct_index/feedback/explanation не
выдаются. Submit: ровно q1..q5, choice_id A..D. Балл вычисляется по сохранённому ключу.
Повтор одинаковых ответов возвращает результат; другие ответы после сдачи →409.
История: limit 1–100 (по умолчанию 20), offset≥0.

## Что работает
CRUD; Dashboard с дедлайнами/нагрузкой/прогрессом; Calendar с автоматическим обновлением;
фото → preview → распознавание → редактирование → подтверждение → сохранение.
JPG/PNG/WEBP до 10 МБ/20 млн пикселей; проверка формата, поворот камеры/удаление EXIF
в памяти. Изображение не сохраняется на сервере. Относительный/неясный срок требует
ручного выбора даты; местный дедлайн передаётся в UTC.

Сложность/время предлагаются по предмету, теме, описанию и типу задания; ручные
исправления сохраняются. Planner по умолчанию 14 дней/120 мин, UI 7/14/30 дней,
лимит 15–480 мин, IANA timezone/busy_minutes. Выполненные задания исключаются;
блоки ≤30 мин, ранние дни приоритетны, день срока резервный. Перегрузка/дефицит
показываются явно. План вычисляется, отдельного сохранённого расписания/трекера нет.

Tutor объясняет школьнику, даёт аналогичный пример, практику без готового решения
и обратную связь. Mini Test: 5 самостоятельных вопросов, 4 варианта, один правильный.
Разбор показывает ошибки и проблемные навыки. Тест не выполняет домашнее задание.

Knowledge Map: предмет → тема → навык. Статусы mastered/good/needs_practice/weak/
not_studied; учитываются три последние попытки с весами 3/2/1, последний провал и
повторные ошибки. Для mastered нужны ≥3 попытки, ≥5 ответов, среднее ≥90% и два
последних результата ≥90%; слабые навыки понижают статус темы. Рекомендации ведут
в прежний Tutor с нужной темой/навыком/уровнем.

## Главный demo-flow и UI
Современная общая оболочка/sidebar/cards, адаптивность, Drawer, loading/empty/error
states, локальный Manrope. StartPage — вход в локальное приложение, без авторизации.
«Новое задание» сразу открывает фото. После подтверждения открывается Smart Planner.
«Разобрать тему» автоматически запускает объяснение. После сдачи основная кнопка
открывает тему результата в карте; фильтры сбрасываются, на телефоне показаны детали.
Рекомендации открывают нужный Tutor. Убраны три лишних действия без новых функций.

Обычные запросы имеют timeout 15 с, фото 65 с, урок/генерация 75 с; отмена и устаревшие
ответы обрабатываются. Ошибки сохраняют поля/ответы и разрешают повтор. Мутации
блокируют повторный клик, создание/сдача защищены от повторного сохранения.

localStorage: studyflow-ui-entered-v1, studyflow.planner.v1, studyflow-active-test-v1,
studyflow-test-answers-v1:{id}. Активный тест/ответы восстанавливаются после reload.
Без localStorage текущий цикл работает. Черновики заданий и Tutor-объяснение живут
только в текущей вкладке; навигация сохраняет их, перезагрузка сбрасывает.

## Проверки и ограничения
238 pytest, 5 Node-проверок API, локальная и размещённая production-сборки frontend.
Новые backend-проверки: защита данных/AI без кода, CORS ошибок, `/api`, запрет запуска
размещённой версии без кода, сохранение SQLite между процессами и полный учебный цикл
через `/api` с подменой внешнего AI.
До подготовки хостинга прошли 14 сценариев Chromium: 4 полных цикла (3 desktop + mobile), ошибки AI, потеря ответа
создания/сдачи, восстановление теста, CRUD/Calendar, Asia/Almaty и 6 экранов на
390/768/1440 px. JS-ошибок 0. qa/output содержит результаты и скриншоты.
Повтор Chromium в текущей среде заблокирован отсутствующим браузером; загрузка
браузера возвращает некорректный архив. Новые `qa/run_hosted_e2e.py` и
`qa/hosted-flow.cjs` подготовлены, но браузерная проверка новой сборки не выполнена.
Полный Docker-образ и реальное размещение на Render ещё не проверены.

В автопроверках подменён только внешний OpenAI HTTP через MockTransport.
Production обращается к настоящему OpenAI; qa не используется обычными BAT.
Действующий ключ не предоставлен: живые OCR/генерация, квота/сеть/задержки не проверены.
Windows BAT проверены по логике и эквивалентным командам Linux, не в самом Windows.
JSON Schema не доказывает правильность учебного содержания AI.

## Важные решения и следующий шаг
Не добавлять большие функции перед хакатоном. Сохранён стек/локальная архитектура;
единственное добавление в БД — техническая защита повтора POST, старые таблицы целы.
Исправлены 4 Critical и 6 Important; новый Critical задержанной загрузки исправлен сразу после его обнаружения. Minor (reload черновиков, масштабирование
истории) оставлены. Отчёт: AUDIT.md. Инструкция репетиции: DAY8_GUIDE.md.
Следующее действие: загрузить StudyFlow_Public.zip в GitHub, подключить репозиторий
через New → Blueprint в Render, вставить OPENAI_API_KEY в Render и проверить
стоимость платного сервера/диска перед Deploy Blueprint. После Live пройти один
полный сценарий со своим AI по публичной ссылке и проверить сохранение при restart.

## Постоянное размещение: настройки
- `Dockerfile`: Node 22 собирает frontend с VITE_API_URL=/api и
  VITE_REQUIRE_ACCESS_CODE=true; Python 3.12 запускает app.hosted:create_app --factory.
- `render.yaml`: Docker Web Service, регион frankfurt, план 0.5c-512mb,
  постоянный диск 1 ГБ `/var/data`, health check `/api/health`.
- `STUDYFLOW_DATABASE_URL=sqlite:////var/data/studyflow.db`; схема таблиц прежняя.
- `STUDYFLOW_DEMO_ACCESS_CODE` генерируется Render. Защищает API заголовком
  X-StudyFlow-Access-Code. В браузере код хранится в памяти/sessionStorage этой вкладки.
- `/`, frontend-ресурсы и health доступны без кода; задания, AI, тесты и карта закрыты.
- Онлайн создаётся отдельная пустая демобаза; локальная база автоматически не переносится.
- GitHub-пакет не содержит .env, пользовательской базы, node_modules или .venv.
- Публичного URL пока нет. Инструкция: HOSTING_GUIDE.md.
