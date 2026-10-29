import TaskList from "./TaskList";
import { Icon } from "./UI";
import { formatDuration, getDashboardSummary, taskCountLabel } from "../utils/dates";

export default function Dashboard({ tasks, now, taskActions, onOpenCalendar, onOpenTasks, onOpenPlanner, onNewTask }) {
  const summary = getDashboardSummary(tasks, now);
  const maxMinutes = Math.max(1, ...summary.week.map((day) => day.minutes));
  const stats = [
    { label: "Задания на сегодня", value: summary.todayTasks.length, note: `${summary.todayCompleted} выполнено`, tone: "mint", symbol: "calendar", id: "today" },
    { label: "Выполнено", value: summary.completed, note: "из всех добавленных заданий", tone: "green", symbol: "check", id: "completed" },
    { label: "Невыполнено", value: summary.pending, note: summary.overdue ? `Просрочено: ${summary.overdue}` : "задания, которые ещё впереди", tone: "amber", symbol: "tasks", id: "pending" },
    { label: "Осталось работы", value: formatDuration(summary.remainingMinutes), note: "по оценкам времени всех невыполненных", tone: "blue", symbol: "clock", id: "workload" },
  ];

  return (
    <div className="dashboard">
      <div className="stats-grid" aria-label="Статистика заданий">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.id} data-stat={stat.id}>
            <div className="stat-top"><span>{stat.label}</span><span className={`stat-symbol ${stat.tone}`} aria-hidden="true"><Icon name={stat.symbol} /></span></div>
            <strong className="stat-value">{stat.value}</strong>
            <p>{stat.note}</p>
          </article>
        ))}
      </div>

      <div className="dashboard-insights">
      <section className="progress-panel" aria-labelledby="progress-heading">
        <div>
          <p className="eyebrow">ШАГ ЗА ШАГОМ</p>
          <h2 id="progress-heading">Твой прогресс</h2>
          <p className="progress-copy">{tasks.length ? `Выполнено ${summary.completed} из ${tasks.length}. Каждое задание — ещё один шаг вперёд.` : "Добавь первое задание, чтобы начать отслеживать прогресс."}</p>
          <div className="progress-track" role="progressbar" aria-label="Прогресс выполнения заданий" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.progress}>
            <span style={{ width: `${summary.progress}%` }} />
          </div>
        </div>
        <div className="progress-ring" style={{ "--progress": `${summary.progress}%` }} aria-hidden="true"><strong>{summary.progress}%</strong><span>выполнено</span></div>
      </section>

      <section className="panel" aria-labelledby="workload-heading">
        <div className="section-heading"><h2 id="workload-heading">Нагрузка по дедлайнам</h2><span className="subtle-label">7 дней</span></div>
        <p className="section-hint">Сумма времени невыполненных заданий на каждый день.</p>
        <div className="week-load">
          {summary.week.map((day, index) => (
            <button className={`load-day ${index === 0 ? "current" : ""}`} key={day.day} onClick={() => onOpenCalendar(day.day)} aria-describedby={`workload-${day.day}`} title={`${day.date.toLocaleDateString("ru-RU")}: ${taskCountLabel(day.count)}, ${formatDuration(day.minutes)} работы`}>
              <span className="visually-hidden" aria-hidden="true" id={`workload-${day.day}`}>{day.date.toLocaleDateString("ru-RU")}: {taskCountLabel(day.count)}, {formatDuration(day.minutes)} работы.</span>
              <span className="load-value">{formatDuration(day.minutes)}</span>
              <span className="load-bar-track"><span className="load-bar" style={{ height: `${day.minutes / maxMinutes * 100}%` }} /></span>
              <strong>{day.date.toLocaleDateString("ru-RU", { weekday: "short" })}</strong>
              <span className="load-date">{day.date.toLocaleDateString("ru-RU", { day: "numeric", month: "2-digit" })}</span>
            </button>
          ))}
        </div>
      </section>

      </div>
      {summary.overdue > 0 && (
        <div className="overdue-notice"><span>Есть просроченные задания: <strong>{summary.overdue}</strong></span><button className="text-button" onClick={onOpenTasks}>Посмотреть →</button></div>
      )}

      <div className="dashboard-tasks">
      <section className="panel" aria-labelledby="today-heading">
        <div className="section-heading">
          <div className="heading-with-count"><h2 id="today-heading">На сегодня</h2><span className="count-badge">{summary.todayTasks.length}</span></div>
          <button className="text-button" onClick={() => onOpenCalendar(summary.today)}>Открыть календарь →</button>
        </div>
        {!!summary.todayTasks.length && <p className="section-hint">По дедлайнам на сегодня. Осталось примерно {formatDuration(summary.todayMinutes)} работы.</p>}
        <TaskList tasks={summary.todayTasks} {...taskActions} emptyMessage="Свободный день" emptyDescription="На сегодня дедлайнов нет. Можно подготовиться к следующим задачам." />
      </section>

      <section className="panel" aria-labelledby="deadlines-heading">
        <div className="section-heading"><h2 id="deadlines-heading">Ближайшие дедлайны</h2><button className="text-button" onClick={onOpenTasks}>Все задания →</button></div>
        <p className="section-hint">До четырёх ближайших невыполненных заданий.</p>
        <TaskList tasks={summary.upcoming} {...taskActions} emptyMessage="Всё спокойно" emptyDescription="Предстоящих дедлайнов нет. Добавь задание, когда появится новая задача." emptyAction={!tasks.length && <button onClick={onNewTask}><Icon name="plus" />Добавить задание</button>} />
      </section>
      </div>
      <section className="planner-shortcut">
        <div><strong>Smart Planner</strong><p>Распредели задания по дням и начни до дедлайна.</p></div>
        <button className="secondary" onClick={onOpenPlanner}>Открыть план →</button>
      </section>
    </div>
  );
}
