import { useEffect, useState } from "react";
import TaskList from "./TaskList";
import { Icon } from "./UI";
import { buildMonthDays, dateFromDayKey, formatDay, formatDuration, localDayKey, taskCountLabel } from "../utils/dates";

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export default function Calendar({ tasks, today, selectedDay, onSelectDay, taskActions }) {
  const [month, setMonth] = useState(() => dateFromDayKey(selectedDay));

  useEffect(() => {
    setMonth(dateFromDayKey(selectedDay));
  }, [selectedDay]);

  const byDay = new Map();
  for (const task of tasks) {
    const key = localDayKey(task.deadline);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(task);
  }
  const selectedTasks = byDay.get(selectedDay) ?? [];
  const remainingMinutes = selectedTasks.filter((task) => !task.completed).reduce((sum, task) => sum + task.estimated_time, 0);
  const monthName = month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  function moveMonth(amount) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1, 12));
  }

  function goToToday() {
    onSelectDay(today);
    setMonth(dateFromDayKey(today));
  }

  return (
    <div className="calendar-view">
      <section className="panel calendar-panel" aria-label="Календарь дедлайнов">
        <div className="calendar-toolbar">
          <h2 className="month-title" aria-live="polite">{monthName}</h2>
          <div className="calendar-controls">
            <button className="secondary today-button" onClick={goToToday}>Сегодня</button>
            <button className="icon-button" onClick={() => moveMonth(-1)} aria-label="Предыдущий месяц"><Icon name="chevron" style={{ transform: "rotate(180deg)" }} /></button>
            <button className="icon-button" onClick={() => moveMonth(1)} aria-label="Следующий месяц"><Icon name="chevron" /></button>
          </div>
        </div>
        <div className="calendar-weekdays" aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid" role="group" aria-label="Дни месяца">
          {buildMonthDays(month).map((date) => {
            const key = localDayKey(date);
            const dayTasks = byDay.get(key) ?? [];
            const isCurrentMonth = date.getMonth() === month.getMonth();
            const isToday = key === today;
            const isSelected = key === selectedDay;
            return (
              <button key={key} className={`calendar-day ${!isCurrentMonth ? "outside-month" : ""} ${isToday ? "is-today" : ""} ${isSelected ? "selected" : ""}`} onClick={() => onSelectDay(key)} aria-pressed={isSelected} aria-current={isToday ? "date" : undefined} aria-describedby={`calendar-info-${key}`} title={`${formatDay(key)}: ${taskCountLabel(dayTasks.length)}`} data-day={key}>
                <span className="visually-hidden" aria-hidden="true" id={`calendar-info-${key}`}>{formatDay(key)}: {taskCountLabel(dayTasks.length)}.</span>
                <span className="calendar-day-top"><span className="day-number">{date.getDate()}</span>{dayTasks.length > 0 && <span className="day-count" aria-hidden="true">{dayTasks.length}</span>}</span>
                <span className="calendar-previews" aria-hidden="true">
                  {dayTasks.slice(0, 2).map((task) => <span className={`calendar-task ${task.completed ? "done" : ""}`} key={task.id}><span className="task-dot" /><span className="calendar-task-label">{task.subject}</span></span>)}
                  {dayTasks.length > 2 && <span className="calendar-more">+{dayTasks.length - 2}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="calendar-legend"><span><i className="task-dot" />Нужно сделать</span><span><i className="task-dot done" />Выполнено</span><span>Выбери день, чтобы увидеть задания</span></div>
      </section>

      <section className="panel selected-day-panel" aria-labelledby="selected-day-heading">
        <div className="section-heading"><div><p className="eyebrow">ВЫБРАННЫЙ ДЕНЬ</p><h2 id="selected-day-heading">{formatDay(selectedDay)}</h2></div><span className="count-badge">{selectedTasks.length}</span></div>
        <p className="section-hint">{taskCountLabel(selectedTasks.length)} · Осталось работы: {formatDuration(remainingMinutes)}</p>
        <TaskList tasks={selectedTasks} {...taskActions} emptyMessage="На этот день заданий нет" emptyDescription="При добавлении задания укажи эту дату в дедлайне." />
      </section>
    </div>
  );
}
