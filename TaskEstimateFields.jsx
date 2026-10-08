import { useEffect, useRef, useState } from "react";
import { estimateTask } from "../api";
import { difficultyLabels, difficultyLevel } from "../utils/difficulty";

const types = {
  auto: "Определить по тексту", exercises: "Задачи и упражнения", reading: "Чтение",
  memorization: "Выучить", essay: "Эссе", project: "Проект", test: "Тест",
  programming: "Программирование", presentation: "Презентация",
};

export default function TaskEstimateFields({ form, setForm, prefix, resetKey, preserveValues = false, enabled = true, onBusyChange }) {
  const [taskType, setTaskType] = useState("auto");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [retry, setRetry] = useState(0);
  const manual = useRef({ difficulty: preserveValues, estimated_time: preserveValues });

  useEffect(() => {
    manual.current = { difficulty: preserveValues, estimated_time: preserveValues };
    setTaskType("auto"); setResult(null); setError("");
  }, [resetKey, preserveValues]);

  useEffect(() => {
    setResult(null); setError("");
    if (!enabled || !form.subject.trim() || !form.topic.trim()) {
      setEstimating(false); onBusyChange(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    setEstimating(true); onBusyChange(true);
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 12_000);
    const timer = window.setTimeout(async () => {
      try {
        const value = await estimateTask({ subject: form.subject, topic: form.topic,
          description: form.description, task_type: taskType }, controller.signal);
        if (!active) return;
        setResult(value);
        setForm((current) => ({ ...current,
          difficulty: manual.current.difficulty ? current.difficulty : value.difficulty,
          estimated_time: manual.current.estimated_time ? current.estimated_time : value.estimated_time,
        }));
      } catch (reason) {
        if (active) setError(timedOut ? "Оценка заняла слишком долго. Время можно указать вручную."
          : "Не удалось оценить задание. Укажи сложность и время вручную или повтори.");
      } finally {
        window.clearTimeout(timeout);
        if (active) { setEstimating(false); onBusyChange(false); }
      }
    }, 350);
    return () => {
      active = false; window.clearTimeout(timer); window.clearTimeout(timeout); controller.abort();
    };
  }, [form.subject, form.topic, form.description, taskType, enabled, resetKey, retry, setForm, onBusyChange]);

  function change(event) {
    const { name, value } = event.target;
    manual.current[name] = true;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function apply() {
    manual.current = { difficulty: false, estimated_time: false };
    setForm((current) => ({ ...current, difficulty: result.difficulty, estimated_time: result.estimated_time }));
  }

  return (
    <div className="estimate-fields" aria-label="Оценка задания">
      <label htmlFor={`${prefix}-type`}>Тип задания</label>
      <select id={`${prefix}-type`} value={taskType} onChange={(event) => setTaskType(event.target.value)}>
        {Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <div className="estimate-summary" aria-live="polite">
        {estimating ? <p role="status" className="estimate-loading"><span className="spinner" aria-hidden="true" />Оцениваем сложность и время…</p> : result ? <>
          <strong>Оценка: {difficultyLabels[result.difficulty].toLowerCase()} · {result.estimated_time} мин</strong>
          <p>Приблизительно. Можно исправить под свой темп.</p>
          <button className="text-button" type="button" onClick={apply}>Применить оценку</button>
          <details><summary>Почему такая оценка?</summary>
            <ul>{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            {result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </details>
        </> : <p>Заполни предмет и тему — система предложит оценку.</p>}
        {error && <><p className="estimate-error" role="alert">{error}</p>
          <button className="text-button" type="button" onClick={() => setRetry((value) => value + 1)}>Повторить оценку</button></>}
      </div>
      <label htmlFor={`${prefix}-difficulty`}>Сложность</label>
      <select id={`${prefix}-difficulty`} name="difficulty" value={difficultyLevel(form.difficulty)} onChange={change}>
        {Object.entries(difficultyLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <label htmlFor={`${prefix}-estimated-time`}>Примерное время, минут</label>
      <input id={`${prefix}-estimated-time`} type="number" name="estimated_time" min="1" max="43200" step="1" value={form.estimated_time} onChange={change} required />
    </div>
  );
}
