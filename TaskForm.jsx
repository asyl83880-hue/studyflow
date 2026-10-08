import { useEffect, useState } from "react";
import TaskEstimateFields from "./TaskEstimateFields";
import { difficultyLevel } from "../utils/difficulty";

const emptyForm = {
  subject: "",
  topic: "",
  description: "",
  deadline: "",
  difficulty: "medium",
  estimated_time: 30,
};

export default function TaskForm({ onSubmit, editingTask, onCancelEdit, disabled, saving }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [resetCount, setResetCount] = useState(0);

  useEffect(() => {
    setError("");
    if (editingTask) {
      const deadline = new Date(editingTask.deadline);
      const pad = (number) => String(number).padStart(2, "0");
      // datetime-local ждёт местное время; API возвращает время с часовым поясом.
      const localDeadline = `${deadline.getFullYear()}-${pad(deadline.getMonth() + 1)}-${pad(deadline.getDate())}T${pad(deadline.getHours())}:${pad(deadline.getMinutes())}`;
      setForm({
        subject: editingTask.subject,
        topic: editingTask.topic,
        description: editingTask.description ?? "",
        deadline: localDeadline,
        difficulty: difficultyLevel(editingTask.difficulty),
        estimated_time: editingTask.estimated_time,
      });
    } else {
      setForm(emptyForm);
    }
    setResetCount((value) => value + 1);
  }, [editingTask]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]:
        name === "difficulty" || name === "estimated_time"
          ? Number(value)
          : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (disabled || estimating) return;
    setError("");
    if (!form.subject.trim() || !form.topic.trim()) {
      setError("Заполни предмет и тему: пробелы не считаются текстом.");
      return;
    }

    const saved = await onSubmit({
      ...form,
      subject: form.subject.trim(),
      topic: form.topic.trim(),
      estimated_time: Number(form.estimated_time),
      deadline: new Date(form.deadline).toISOString(),
    });

    if (saved && !editingTask) {
      setForm(emptyForm);
      setResetCount((value) => value + 1);
    }
  }

  return (
    <form className="task-form" onSubmit={handleSubmit} aria-label={editingTask ? "Изменить задание" : "Новое задание"}>
      <fieldset disabled={disabled}>

      <label htmlFor="subject">Предмет</label>
      <input
        id="subject"
        name="subject"
        placeholder="Например, алгебра"
        maxLength={100}
        value={form.subject}
        onChange={handleChange}
        required
      />

      <label htmlFor="topic">Тема</label>
      <input
        id="topic"
        name="topic"
        placeholder="Квадратные уравнения"
        maxLength={200}
        value={form.topic}
        onChange={handleChange}
        required
      />

      <label htmlFor="description">Описание <span className="optional">необязательно</span></label>
      <textarea
        id="description"
        name="description"
        placeholder="Что нужно сделать?"
        maxLength={5000}
        value={form.description}
        onChange={handleChange}
      />

      <label>
        Дедлайн
        <input
          type="datetime-local"
          name="deadline"
          value={form.deadline}
          onChange={handleChange}
          required
        />
      </label>

      <TaskEstimateFields form={form} setForm={setForm} prefix="manual"
        resetKey={resetCount} preserveValues={Boolean(editingTask)} onBusyChange={setEstimating} />

      {error && <p className="error" role="alert">{error}</p>}

      <button type="submit" disabled={estimating}>
        {saving ? "Сохраняем…" : editingTask ? "Сохранить" : "Добавить"}
      </button>

      {editingTask && (
        <button type="button" className="secondary" onClick={onCancelEdit}>
          Отмена
        </button>
      )}
      </fieldset>
    </form>
  );
}
