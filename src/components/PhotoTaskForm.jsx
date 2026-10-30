import { useEffect, useRef, useState } from "react";
import { recognizeTaskImage } from "../api";
import TaskEstimateFields from "./TaskEstimateFields";
import { LoadingState } from "./UI";

const emptyForm = {
  subject: "", topic: "", description: "", deadlineDate: "", deadlineTime: "18:00",
  difficulty: "medium", estimated_time: 30,
};
const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

export default function PhotoTaskForm({ onConfirm, onManual, disabled }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [imageError, setImageError] = useState(false);
  const [draft, setDraft] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef(null);
  const requestId = useRef(0);
  const requestController = useRef(null);
  const saveInProgress = useRef(false);
  const reviewHeading = useRef(null);

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => () => {
    requestId.current += 1;
    requestController.current?.abort();
  }, []);

  function reset() {
    requestId.current += 1;
    requestController.current?.abort();
    setFile(null); setDraft(null); setForm(emptyForm);
    setImageError(false); setReading(false); setEstimating(false); setError(""); setNotice("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function chooseFile(event) {
    if (saveInProgress.current || disabled) return;
    const chosen = event.target.files?.[0];
    if (!chosen) return; // Закрытие диалога не стирает текущий черновик.
    reset();
    if (chosen.type && !allowedTypes.includes(chosen.type)) {
      setError("Выбери изображение JPG, PNG или WEBP."); return;
    }
    if (chosen.size > 10 * 1024 * 1024) {
      setError("Изображение больше 10 МБ. Уменьши его размер."); return;
    }
    setFile(chosen);
  }

  async function recognize() {
    if (!file || imageError || reading || disabled || saveInProgress.current) return;
    const id = ++requestId.current;
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    setReading(true); setDraft(null); setError(""); setNotice("");
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 65_000);
    try {
      const result = await recognizeTaskImage(file, controller.signal);
      if (id !== requestId.current) return;
      setDraft(result);
      setForm({
        ...emptyForm, subject: result.subject ?? "", topic: result.topic ?? "",
        description: result.description ?? "", deadlineDate: result.deadline_date ?? "",
        deadlineTime: result.deadline_time ?? "18:00",
      });
      window.requestAnimationFrame(() => reviewHeading.current?.focus({ preventScroll: true }));
    } catch (reason) {
      if (id !== requestId.current) return;
      setError(timedOut ? "Распознавание заняло слишком долго. Попробуй ещё раз."
        : reason.name === "AbortError" ? "Распознавание отменено."
        : reason instanceof TypeError ? "Не удалось отправить фото. Проверь, что сервер запущен."
        : reason.message);
    } finally {
      window.clearTimeout(timer);
      if (id === requestId.current) {
        setReading(false); requestController.current = null;
      }
    }
  }

  function changeField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function confirm(event) {
    event.preventDefault();
    if (disabled || reading || estimating || saveInProgress.current || !draft) return;
    setError("");
    const deadline = new Date(`${form.deadlineDate}T${form.deadlineTime}`);
    if (!form.subject.trim() || !form.topic.trim() || !form.deadlineDate
      || !form.deadlineTime || !Number.isFinite(deadline.getTime())) {
      setError("Проверь предмет, тему, дату и время дедлайна."); return;
    }
    saveInProgress.current = true;
    setSaving(true);
    try {
      // Единственное место в компоненте, которое создаёт задание.
      const saved = await onConfirm({
        subject: form.subject.trim(), topic: form.topic.trim(),
        description: form.description.trim(), deadline: deadline.toISOString(),
        difficulty: form.difficulty, estimated_time: Number(form.estimated_time),
      });
      if (saved) {
        reset(); setNotice("Задание сохранено. Оно уже появилось в списке и календаре.");
      } else {
        setError("Не удалось сохранить задание. Фото и исправления остались — попробуй ещё раз.");
      }
    } catch (failure) {
      setError(`${failure.message || "Не удалось сохранить задание."} Фото и исправления остались в форме.`);
    } finally {
      saveInProgress.current = false; setSaving(false);
    }
  }

  const locked = disabled || saving;
  const canConfirm = draft && form.subject.trim() && form.topic.trim()
    && form.deadlineDate && form.deadlineTime;
  const needsReview = (field) => draft?.uncertain_fields?.includes(field);

  return (
    <section className="photo-task-panel" aria-label="Задание по фото">
      <div className="photo-panel-intro">
        <span className="photo-ai-badge">ФОТО → ЗАДАНИЕ</span>
        <h2>Задание по фото</h2>
        <p className="section-hint">Загрузи фото или скриншот. Проверь результат перед сохранением.</p>
      </div>

      <input ref={fileInput} className="visually-hidden" id="task-photo" type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onChange={chooseFile} disabled={locked} aria-describedby="photo-file-hint" />
      <button className="photo-upload-button secondary" type="button" disabled={locked}
        onClick={() => fileInput.current?.click()}>
        <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M4 8h4l2-3h4l2 3h4v12H4z" /><circle cx="12" cy="13" r="3" />
        </svg>
        {file ? "Выбрать другое фото" : "Выбрать фото или скриншот"}
      </button>
      <label className="visually-hidden" htmlFor="task-photo">Фото задания</label>
      <p className="photo-file-hint" id="photo-file-hint">JPG, PNG, WEBP · до 10 МБ</p>

      {file && <figure className="photo-preview">
        {preview && <img src={preview} alt="Предпросмотр фото задания"
          onError={() => { setImageError(true); setError("Не удалось открыть изображение. Выбери другое фото."); }} />}
        <figcaption>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} МБ</figcaption>
      </figure>}

      {file && <div className="photo-actions">
        <button type="button" onClick={recognize} disabled={locked || reading || imageError}>
          {reading ? "Распознаём…" : draft ? "Распознать заново" : "Распознать"}
        </button>
        <button className="secondary" type="button" onClick={reset} disabled={locked}>
          {reading ? "Отменить" : "Убрать фото"}
        </button>
      </div>}
      {reading && <LoadingState>Загружаем фото и распознаём текст…</LoadingState>}
      {error && <p className="error photo-error" role="alert">{error}</p>}
      {error && !draft && onManual && <button className="secondary" type="button" disabled={locked || reading} onClick={onManual}>Добавить задание вручную</button>}
      {notice && <p className="photo-success" role="status">{notice}</p>}

      {draft && <form className="task-form photo-review" onSubmit={confirm} aria-label="Проверка AI задания">
        <h2 ref={reviewHeading} tabIndex={-1}>AI распознал:</h2>
        <p className="section-hint">Это черновик. Исправь поля и нажми «Подтвердить».</p>
        {draft.warnings?.length > 0 && <div className="photo-warning" role="status">
          <strong>Нужна проверка</strong>
          <ul>{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
        </div>}
        {draft.raw_text && <details className="recognized-text">
          <summary>Текст на фото</summary><p>{draft.raw_text}</p>
        </details>}
        <fieldset disabled={locked || reading}>
          <label htmlFor="photo-subject">Предмет {needsReview("subject") && <span className="review-label">проверь</span>}</label>
          <input id="photo-subject" name="subject" value={form.subject} onChange={changeField} maxLength={100} required />
          <label htmlFor="photo-topic">Тема {needsReview("topic") && <span className="review-label">проверь</span>}</label>
          <input id="photo-topic" name="topic" value={form.topic} onChange={changeField} maxLength={200} required />
          <label htmlFor="photo-description">Описание {needsReview("description") && <span className="review-label">проверь</span>}</label>
          <textarea id="photo-description" name="description" value={form.description} onChange={changeField} maxLength={5000} />

          <p className="photo-deadline-text">Срок на фото: <strong>{draft.deadline || "не указан"}</strong></p>
          <label htmlFor="photo-deadline-date">Дата дедлайна {needsReview("deadline") && <span className="review-label">выбери дату</span>}</label>
          <input id="photo-deadline-date" type="date" name="deadlineDate" value={form.deadlineDate} onChange={changeField} required />
          <label htmlFor="photo-deadline-time">Время дедлайна</label>
          <input id="photo-deadline-time" type="time" name="deadlineTime" value={form.deadlineTime} onChange={changeField} required />
          <p className="photo-field-hint">Местное время компьютера.{!draft.deadline_time && " AI не выделил время: форма предложила 18:00. Можно изменить."}</p>

          <TaskEstimateFields form={form} setForm={setForm} prefix="photo" resetKey={draft}
            onBusyChange={setEstimating} />
          <button type="submit" disabled={!canConfirm || estimating}>{saving ? "Сохраняем…" : "Подтвердить"}</button>
          <button type="button" className="secondary" onClick={reset}>Отмена</button>
        </fieldset>
      </form>}
      <p className="photo-privacy-note">После «Распознать» фото отправится в OpenAI для чтения текста. Проверь, что на нём только нужное задание.</p>
    </section>
  );
}
