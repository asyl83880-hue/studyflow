import { difficultyLabels, difficultyLevel } from "../utils/difficulty";
import { Icon } from "./UI";

export default function TaskItem({ task, onEdit, onDelete, onComplete, onOpenTutor, disabled }) {
  return (
    <article className={`task-item ${task.completed ? "completed" : ""}`}>
      <div className="task-content">
        <div className="task-topline"><span className="task-subject">{task.subject}</span><span className={`task-status ${task.completed ? "done" : ""}`}>{task.completed ? <><Icon name="check" size={13} />Выполнено</> : "Нужно сделать"}</span></div>
        <h3>{task.topic}</h3>
        {task.description && <p>{task.description}</p>}
        <div className="task-meta"><span><Icon name="calendar" size={15} /><span>Дедлайн: {new Date(task.deadline).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></span><span><Icon name="clock" size={15} />{task.estimated_time} мин</span><span className={`difficulty-badge ${difficultyLevel(task.difficulty)}`}>{difficultyLabels[difficultyLevel(task.difficulty)]}</span></div>
      </div>

      <div className="actions">
        {onOpenTutor && <button disabled={disabled} className="secondary tutor-task-button" onClick={() => onOpenTutor(task)}><Icon name="tutor" size={16} />Разобрать тему</button>}
        {!task.completed && (
          <button disabled={disabled} onClick={() => onComplete(task.id)}><Icon name="check" size={16} />Выполнено</button>
        )}

        <button disabled={disabled} className="text-button" onClick={() => onEdit(task)}>
          Изменить
        </button>

        <button disabled={disabled} className="text-button danger" onClick={() => onDelete(task.id)}>
          Удалить
        </button>
      </div>
    </article>
  );
}
