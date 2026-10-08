import { useEffect, useRef, useState } from "react";
import { createMiniTest, getMiniTest, getTestHistory, getTestResult, getTutorLesson, submitMiniTest } from "../api";
import MiniTest from "./MiniTest";
import TestResult from "./TestResult";
import { Icon, EmptyState, LoadingState } from "./UI";

const ACTIVE_TEST_KEY = "studyflow-active-test-v1";
const answerKey = (id) => `studyflow-test-answers-v1:${id}`;
const levels = { beginner: "Начальный", intermediate: "Средний", advanced: "Уверенный" };
const actions = [
  ["explain", "Объясни тему"], ["example", "Покажи пример"],
  ["easy_exercise", "Дай простое задание"], ["harder_exercise", "Дай сложнее"],
  ["check_answer", "Проверь мой ответ"], ["mini_test", "Начать мини-тест"],
];
const verdicts = { correct: "Верно", partly_correct: "Частично верно", incorrect: "Есть ошибка", cannot_check: "Нужно уточнить условие" };
function readStorage(key) { try { return localStorage.getItem(key); } catch { return null; } }
function saveStorage(key, value) { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* Можно учиться и без localStorage. */ } }
function savedAnswers(test) {
  try {
    const data = JSON.parse(readStorage(answerKey(test.id)) || "{}");
    return Object.fromEntries(test.questions.filter((question) => question.choices.some((choice) => choice.id === data?.[question.id]))
      .map((question) => [question.id, data[question.id]]));
  } catch { return {}; }
}

export default function AITutor({ initialTopic, visible, onTestCompleted, onOpenKnowledgeMap }) {
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("beginner");
  const [context, setContext] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [exerciseText, setExerciseText] = useState("");
  const [studentAnswer, setStudentAnswer] = useState("");
  const [quiz, setQuiz] = useState(null);
  const [selections, setSelections] = useState({});
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [practiceGoal, setPracticeGoal] = useState(0);
  const inFlight = useRef(null);
  const sequence = useRef(0);
  const historySequence = useRef(0);
  const generationAttempt = useRef(null);
  const restored = useRef(false);

  useEffect(() => () => {
    sequence.current += 1;
    historySequence.current += 1;
    inFlight.current?.abort();
  }, []);

  function cancelCurrent() {
    sequence.current += 1;
    inFlight.current?.abort();
    inFlight.current = null;
    setBusy("");
  }

  function activateTopic(next, description = "") {
    cancelCurrent();
    generationAttempt.current = null;
    setContext(next);
    setSubject(next.subject); setTopic(next.topic); setLevel(next.student_level);
    setLesson(null); setQuiz(null); setResult(null); setSelections({}); setError("");
    setExerciseText(description); setStudentAnswer("");
    setPracticeGoal(0);
    saveStorage(ACTIVE_TEST_KEY, null);
  }

  useEffect(() => {
    if (!initialTopic) return;
    restored.current = true;
    const next = { subject: initialTopic.subject, topic: initialTopic.topic,
      student_level: initialTopic.student_level || "beginner", task_id: initialTopic.id ?? null };
    if (initialTopic.focus_concept) next.focus_concept = initialTopic.focus_concept;
    activateTopic(next, initialTopic.description || "");
    if (initialTopic.action === "mini_test") {
      generationAttempt.current = { fingerprint: JSON.stringify(next), requestId: crypto.randomUUID() };
      perform("mini_test", (signal) => createMiniTest({ ...next, request_id: generationAttempt.current.requestId }, signal), (data) => {
        generationAttempt.current = null; showQuiz(data); refreshHistory();
      });
    } else if (initialTopic.action === "explain" || initialTopic.action === "practice") {
      const action = initialTopic.action === "practice" ? "easy_exercise" : "explain";
      if (initialTopic.action === "practice") setPracticeGoal(initialTopic.practice_goal || 3);
      perform(action, (signal) => getTutorLesson({ ...next, action }, signal), (data) => {
        setLesson(data.lesson);
        if (data.lesson.exercise) setExerciseText(data.lesson.exercise.prompt);
      });
    }
  }, [initialTopic]);

  async function refreshHistory() {
    const version = ++historySequence.current;
    setHistoryLoading(true);
    try {
      const data = await getTestHistory();
      if (version === historySequence.current) { setHistory(data); setHistoryError(""); }
    } catch {
      if (version === historySequence.current) setHistoryError("Не удалось загрузить историю. Проверь сервер и повтори.");
    } finally {
      if (version === historySequence.current) setHistoryLoading(false);
    }
  }

  async function perform(kind, operation, onSuccess) {
    if (inFlight.current) return;
    const version = ++sequence.current;
    const controller = new AbortController();
    inFlight.current = controller;
    setBusy(kind); setError("");
    const timer = window.setTimeout(() => controller.abort(), 75_000);
    try {
      const data = await operation(controller.signal);
      if (version === sequence.current) onSuccess(data);
    } catch (failure) {
      if (version === sequence.current) setError(controller.signal.aborted
        ? "Ответ не пришёл вовремя. Повтори попытку — выбранные ответы сохранены."
        : failure instanceof TypeError ? "Не удалось связаться с сервером. Проверь подключение и повтори."
          : failure.message || "Не удалось выполнить действие. Попробуй ещё раз.");
    } finally {
      window.clearTimeout(timer);
      if (version === sequence.current) { inFlight.current = null; setBusy(""); }
    }
  }

  function showQuiz(data, savedResult = null) {
    const next = { subject: data.subject, topic: data.topic, student_level: data.student_level, task_id: null };
    const concepts = [...new Set(data.questions.map((question) => question.concept_label))];
    if (concepts.length === 1) next.focus_concept = concepts[0];
    setContext(next); setSubject(next.subject); setTopic(next.topic); setLevel(next.student_level);
    setQuiz(data); setResult(savedResult); setLesson(null); setExerciseText(""); setStudentAnswer("");
    setSelections(savedResult ? {} : savedAnswers(data));
    setPracticeGoal(0);
    saveStorage(ACTIVE_TEST_KEY, data.id);
  }

  function openSavedTest(id) {
    if (inFlight.current) return;
    generationAttempt.current = null;
    perform("load", async (signal) => {
      const data = await getMiniTest(id, signal);
      const savedResult = data.status === "completed" ? await getTestResult(id, signal) : null;
      return { data, savedResult };
    }, ({ data, savedResult }) => showQuiz(data, savedResult));
  }

  useEffect(() => {
    if (!visible) return;
    refreshHistory();
    if (!restored.current) {
      restored.current = true;
      const id = readStorage(ACTIVE_TEST_KEY);
      if (id) openSavedTest(id);
    }
  }, [visible]);

  const draftChanged = context && (context.subject !== subject.trim() || context.topic !== topic.trim() || context.student_level !== level);
  const activeTest = quiz && !result;
  const actionsDisabled = Boolean(busy || !context || draftChanged || activeTest);

  function runLesson(action) {
    if (!context || inFlight.current || activeTest || draftChanged) return;
    if (action === "check_answer" && (!exerciseText.trim() || !studentAnswer.trim())) {
      setError("Добавь полное условие и свой ответ в поля ниже.");
      return;
    }
    perform(action, (signal) => getTutorLesson({
      ...context, action,
      exercise_text: action === "check_answer" ? exerciseText.trim() : null,
      student_answer: action === "check_answer" ? studentAnswer.trim() : null,
    }, signal), (data) => {
      setQuiz(null); setResult(null); saveStorage(ACTIVE_TEST_KEY, null);
      setLesson(data.lesson);
      if (data.lesson.exercise) { setExerciseText(data.lesson.exercise.prompt); setStudentAnswer(""); }
    });
  }

  function startTest() {
    if (!context || inFlight.current || activeTest || draftChanged) return;
    const fingerprint = JSON.stringify(context);
    if (generationAttempt.current?.fingerprint !== fingerprint) {
      generationAttempt.current = { fingerprint, requestId: crypto.randomUUID() };
    }
    perform("mini_test", (signal) => createMiniTest({ ...context, request_id: generationAttempt.current.requestId }, signal), (data) => {
      generationAttempt.current = null;
      showQuiz(data);
      refreshHistory();
    });
  }

  function selectAnswer(questionId, choiceId) {
    if (inFlight.current || !quiz || result) return;
    const next = { ...selections, [questionId]: choiceId };
    setSelections(next);
    saveStorage(answerKey(quiz.id), JSON.stringify(next));
  }

  function finishTest() {
    if (!quiz || result || inFlight.current || quiz.questions.some((question) => !selections[question.id])) return;
    perform("submit", (signal) => submitMiniTest(quiz.id, quiz.questions.map((question) => ({
      question_id: question.id, choice_id: selections[question.id],
    })), signal), (data) => {
      setResult(data);
      onTestCompleted?.(data);
      saveStorage(answerKey(quiz.id), null);
      refreshHistory();
    });
  }

  function repeatExplanation() {
    if (!context || inFlight.current) return;
    setQuiz(null); setResult(null); setLesson(null);
    saveStorage(ACTIVE_TEST_KEY, null);
    // Используем тот же снимок темы и уровня, включая повтор после удаления задания.
    perform("explain", (signal) => getTutorLesson({ ...context, action: "explain" }, signal), (data) => setLesson(data.lesson));
  }

  return <div className="tutor-layout">
    <div className="tutor-main">
      <section className="panel" aria-labelledby="topic-title">
        <h2 id="topic-title">Выбери тему</h2>
        <p className="section-description">Открой тему из задания или введи её здесь. Объяснение → практика → мини-тест.</p>
        <form className="tutor-topic-form" onSubmit={(event) => {
          event.preventDefault(); restored.current = true;
          activateTopic({ subject: subject.trim(), topic: topic.trim(), student_level: level, task_id: null });
        }}>
          <label>Предмет<input required disabled={Boolean(busy)} maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Например, математика" /></label>
          <label>Тема<input required disabled={Boolean(busy)} maxLength={300} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Например, квадратные уравнения" /></label>
          <label>Уровень ученика<select disabled={Boolean(busy)} value={level} onChange={(event) => setLevel(event.target.value)}>
            {Object.entries(levels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <button type="submit" disabled={Boolean(busy) || !subject.trim() || !topic.trim()}>Открыть тему</button>
        </form>
        {context && <div className="tutor-topic-summary"><strong>{context.subject} — {context.topic}</strong><span>{levels[context.student_level]} уровень{context.focus_concept ? ` · Навык: ${context.focus_concept}` : ""}</span></div>}
        {!!practiceGoal && <p className="tutor-practice-goal">Цель: решить {practiceGoal} задания по очереди. Реши текущее, нажми «Проверь мой ответ», затем «Дай простое задание» для следующего.</p>}
        {draftChanged && <p className="muted" role="status">Нажми «Открыть тему», чтобы применить изменения.</p>}
        <div className="tutor-actions" aria-label="Действия AI Tutor">
          {actions.map(([action, label]) => <button type="button" key={action} className="secondary" disabled={actionsDisabled || Boolean(result && action === "check_answer")}
            onClick={() => action === "mini_test" ? startTest() : runLesson(action)}><Icon name={action === "mini_test" ? "play" : action === "check_answer" ? "check" : action.includes("exercise") ? "edit" : action === "example" ? "spark" : "book"} size={17} />{label}</button>)}
        </div>
        {activeTest && <p className="muted">Во время мини-теста сначала ответь самостоятельно. После сдачи откроется разбор.</p>}
        {!context && <div className="tutor-start-hint"><Icon name="tutor" /><span>Введи предмет и тему, чтобы начать.</span></div>}
      </section>

      {busy && <LoadingState detail="Это может занять немного времени.">{busy === "submit" ? "Проверяем ответы и сохраняем результат…" : busy === "load" ? "Открываем сохранённый тест…" : busy === "mini_test" ? "Готовим пять вопросов…" : "Готовим ответ AI Tutor…"}</LoadingState>}
      {error && <div className="error" role="alert">{error}</div>}

      {lesson && <section className="panel tutor-lesson" aria-labelledby="lesson-title">
        <h2 id="lesson-title">{lesson.title}</h2>
        <p className="tutor-text">{lesson.body}</p>
        <ol>{lesson.steps.map((step, index) => <li className="tutor-text" key={index}>{step}</li>)}</ol>
        {lesson.example && <div className="tutor-example"><h3>Пример</h3><p className="tutor-text">{lesson.example.problem}</p><p className="tutor-text">{lesson.example.explanation}</p><p className="tutor-text"><strong>Ответ с объяснением:</strong> {lesson.example.solution}</p></div>}
        {lesson.exercise && <div className="tutor-example"><h3>Попробуй сам</h3><p className="tutor-text">{lesson.exercise.prompt}</p><p className="tutor-text"><strong>Подсказка:</strong> {lesson.exercise.hint}</p></div>}
        {lesson.check && <div className={`tutor-check verdict-${lesson.check.verdict}`}><h3>{verdicts[lesson.check.verdict]}</h3><p className="tutor-text">{lesson.check.feedback}</p><p className="tutor-text"><strong>Следующий шаг:</strong> {lesson.check.next_step}</p></div>}
      </section>}

      {context && !activeTest && !result && <section className="panel tutor-answer" aria-labelledby="answer-title">
        <h2 id="answer-title">Проверь свой ответ</h2>
        <p className="section-description">Нужно полное условие: одного номера из учебника недостаточно.</p>
        <label>Условие задания<textarea maxLength={3000} rows={3} value={exerciseText} disabled={Boolean(busy)} onChange={(event) => setExerciseText(event.target.value)} placeholder="Вставь условие целиком" /></label>
        <label>Мой ответ<textarea maxLength={3000} rows={3} value={studentAnswer} disabled={Boolean(busy)} onChange={(event) => setStudentAnswer(event.target.value)} placeholder="Запиши ответ и свои шаги" /></label>
        <button type="button" disabled={actionsDisabled || !exerciseText.trim() || !studentAnswer.trim()} onClick={() => runLesson("check_answer")}>Проверить ответ</button>
      </section>}

      {quiz && !result && <MiniTest test={quiz} selections={selections} onSelect={selectAnswer} onSubmit={finishTest} disabled={Boolean(busy)} />}
      {result && <TestResult result={result} onRepeat={repeatExplanation} onOpenKnowledgeMap={onOpenKnowledgeMap} onNewTest={() => {
        if (inFlight.current || draftChanged) return;
        setQuiz(null); setResult(null); generationAttempt.current = null;
        // activeTest уже false, поэтому новый запрос получает новый request_id.
        startTest();
      }} disabled={Boolean(busy || draftChanged)} />}
    </div>

    <aside className="panel tutor-history" aria-labelledby="history-title">
      <div className="section-heading"><h2 id="history-title">Мои мини-тесты</h2></div>
      <p className="section-description">Последние 20 тестов. Продолжи попытку или вернись к разбору.</p>
      {historyError && <p role="alert" className="history-error">{historyError}</p>}
      <button type="button" className="text-button" disabled={historyLoading} onClick={refreshHistory}>Обновить историю</button>
      {historyLoading && !history.length && <LoadingState>Загружаем историю…</LoadingState>}
      {!history.length && !historyError && !historyLoading && <EmptyState compact icon="book" title="История начинается здесь" description="Пройди мини-тест, чтобы сохранить результат и увидеть разбор." />}
      <ul className="test-history-list">{history.map((test) => <li key={test.id}>
        <strong>{test.subject} — {test.topic}</strong>
        <span>{levels[test.student_level]} · {new Date(test.created_at).toLocaleDateString("ru-RU")}</span>
        <span>{test.status === "completed" ? `${test.correct_count} из ${test.total_count} верно` : "Тест ещё не сдан"}</span>
        <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => openSavedTest(test.id)}>{test.status === "completed" ? "Открыть разбор" : "Продолжить тест"}</button>
      </li>)}</ul>
      {readStorage(ACTIVE_TEST_KEY) && error && !quiz && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => openSavedTest(readStorage(ACTIVE_TEST_KEY))}>Открыть последний тест снова</button>}
    </aside>
  </div>;
}
