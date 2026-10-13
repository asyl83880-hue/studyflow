# StudyFlow — исправление ошибки GitHub Actions

Скриншот ошибки: `Failed to resolve /src/main.jsx from index.html`.
GitHub Actions выполняет `npm ci` и `npm run build` в корне репозитория.
Поэтому фронтенд должен иметь `src/main.jsx` прямо в корне репозитория.

Это исправление собрано из ранее сохранённого StudyFlow_Public.zip, а не считано напрямую с текущего GitHub.
Сравни изменения перед Commit, если редактировал код после архива.

## Инструкция без командной строки
1. Распакуй StudyFlow_GitHub_Fix.zip на компьютере.
2. На GitHub открой репозиторий studyflow, выбери Add file -> Upload files.
3. Перетащи **СОДЕРЖИМОЕ** распакованной папки:
   src, public, tests, package.json, этот README.
4. Проверь, что список файлов показывает именно `src/main.jsx`, `src/App.jsx`,
   `src/components/Dashboard.jsx`, `src/utils/dates.js`, а не просто `main.jsx`.
5. Нажми Commit changes и дождись нового GitHub Actions build.

Текущие index.html, vite.config.js и package-lock.json оставь без изменений.
В package.json добавлен `npm test` с тестами API. Он нужен, если CI запускает `npm test` после сборки.

Проверь в GitHub Actions: npm ci -> npm run build -> npm test.
На устройстве можно выполнить `npm ci`, `npm run build`, `npm test`.

Важно: исправление закрывает показанную ошибку Vite. Другие проблемы CI,
настройки хостинга и backend после этого нужно проверять по новым логам.
Не добавляй в GitHub `.env`, ключ API, `studyflow.db`.
