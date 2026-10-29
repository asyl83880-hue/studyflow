// День определяем в часовом поясе браузера, а не обрезанием UTC-строки.
export function localDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateFromDayKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  // Полдень безопасен при переходах на летнее/зимнее время около полуночи.
  return new Date(year, month - 1, day, 12);
}

export function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export function formatDay(key) {
  return dateFromDayKey(key).toLocaleDateString("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
  });
}

export function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} мин`;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

export function taskCountLabel(count) {
  const tens = count % 100;
  const last = count % 10;
  const word = tens >= 11 && tens <= 14 ? "заданий"
    : last === 1 ? "задание" : last >= 2 && last <= 4 ? "задания" : "заданий";
  return `${count} ${word}`;
}

export function buildMonthDays(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = addDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function getDashboardSummary(tasks, now) {
  const today = localDayKey(now);
  const pending = tasks.filter((task) => !task.completed);
  const completed = tasks.length - pending.length;
  const sumTime = (items) => items.reduce((sum, task) => sum + task.estimated_time, 0);
  const byDeadline = (a, b) => new Date(a.deadline) - new Date(b.deadline) || a.id - b.id;
  const todayTasks = tasks.filter((task) => localDayKey(task.deadline) === today).sort(byDeadline);
  const todayPending = todayTasks.filter((task) => !task.completed);
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(dateFromDayKey(today), index);
    const day = localDayKey(date);
    const dayTasks = pending.filter((task) => localDayKey(task.deadline) === day);
    return { day, date, minutes: sumTime(dayTasks), count: dayTasks.length };
  });

  return {
    today,
    todayTasks,
    todayMinutes: sumTime(todayPending),
    todayCompleted: todayTasks.length - todayPending.length,
    completed,
    pending: pending.length,
    remainingMinutes: sumTime(pending),
    progress: tasks.length ? Math.round(completed / tasks.length * 100) : 0,
    overdue: pending.filter((task) => new Date(task.deadline) < now).length,
    upcoming: pending.filter((task) => new Date(task.deadline) >= now).sort(byDeadline).slice(0, 4),
    week,
  };
}
