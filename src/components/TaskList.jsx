import TaskItem from "./TaskItem";
import { EmptyState } from "./UI";

export default function TaskList({ tasks, onEdit, onDelete, onComplete, onOpenTutor, disabled, loadFailed, emptyMessage = "Пока нет заданий", emptyDescription, emptyAction }) {
  if (tasks.length === 0) {
    return <EmptyState compact title={loadFailed ? "Список заданий недоступен" : emptyMessage} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="task-list">
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          onEdit={onEdit}
          onDelete={onDelete}
          onComplete={onComplete}
          onOpenTutor={onOpenTutor}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
