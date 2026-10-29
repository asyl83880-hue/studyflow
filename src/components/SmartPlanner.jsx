import { useEffect, useState } from "react";
import { getStudyPlan, userStorageKey } from "../api";
import { addDays, dateFromDayKey, formatDuration, localDayKey } from "../utils/dates";
import { difficultyLabels } from "../utils/difficulty";
import { Icon, LoadingState } from "./UI";

const storageKey = "studyflow.planner.v1";
const defaults = { daily_limit: 120, horizon_days: 14, busy_minutes: {} };

function savedSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(userStorageKey(storageKey)));
    if (!saved || !Number.isInteger(saved.daily_limit) || saved.daily_limit < 15
      || saved.daily_limit > 480 || ![7, 14, 30].includes(saved.horizon_days)) return defaults;
    const busy_minutes = {};
    for (const [key, value] of Object.entries(saved.busy_minutes || {}).slice(-60)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && localDayKey(dateFromDayKey(key)) === key
        && Number.isInteger(value) && value >= 0 && value <= 1440) busy_minutes[key] = value;
    }
    return { daily_limit: saved.daily_limit, horizon_days: saved.horizon_days, busy_minutes };
  } catch { return defaults; }
}

function labelForDay(key, today) {
  if (key === today) return "Сегодня";
  if (key === localDayKey(addDays(dateFromDayKey(today), 1))) return "Завтра";
  if (key === localDayKey(addDays(dateFromDayKey(today), 2))) return "Послезавтра";
  return dateFromDayKey(key).toLocaleDateString("ru-RU", { weekday: "long" });
}

export default function SmartPlanner({ tasks, now, taskActions }) {
  const [settings, setSettings] = useState(savedSettings);
  const [draft, setDraft] = useState(() => settings);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [retry, setRetry] = useState(0);
  const [showEmpty, setShowEmpty] = useState(false);
  const today = localDayKey(now);
  const minute = Math.floor(now.getTime() / 60_000);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const upcomingDays = Array.from({ length: Number(draft.horizon_days) }, (_, index) => localDayKey(addDays(dateFromDayKey(today), index)));

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    setLoading(true); setError(""); setPlan(null);
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);
    getStudyPlan({ ...settings, timezone }, controller.signal).then((value) => {
      if (active) setPlan(value);
    }).catch((reason) => {
      if (active) setError(timedOut ? "Планирование заняло слишком долго. Повтори запрос."
        : "Не удалось построить план. Проверь, что сервер запущен, и повтори.");
    }).finally(() => {
      window.clearTimeout(timer);
      if (active) setLoading(false);
    });
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [tasks, settings, timezone, minute, retry]);

  function applySettings(event) {
    event.preventDefault();
    const limit = Number(draft.daily_limit);
    if (!Number.isInteger(limit) || limit < 15 || limit > 480) {
      setSettingsError("Укажи дневной лимит от 15 до 480 минут."); return;
    }
    const busy_minutes = {};
    for (const key of upcomingDays) {
      const value = Number(draft.busy_minutes[key] ?? 0);
      if (!Number.isInteger(value) || value < 0 || value > 1440) {
        setSettingsError("Для других дел укажи от 0 до 1440 минут."); return;
      }
      if (value) busy_minutes[key] = value;
    }
    const next = { daily_limit: limit, horizon_days: Number(draft.horizon_days), busy_minutes };
    setSettingsError(""); setSettings(next); setDraft(next);
    try { window.localStorage.setItem(userStorageKey(storageKey), JSON.stringify(next)); } catch { /* План работает и без сохранения настроек. */ }
  }

  function changeBusy(key, value) {
    setDraft((current) => ({ ...current, busy_minutes: { ...current.busy_minutes, [key]: value } }));
  }

  return (
    <div className="planner-view">
      <section className="planner-intro">
        <p className="eyebrow">УЧЁБА БЕЗ ПОСЛЕДНЕЙ НОЧИ</p>
        <h2>Небольшие шаги каждый день</h2>
        <p>Короткие блоки, ближайшие дедлайны и время для других дел. План обновляется после изменения заданий.</p>
        <span className="planner-chip"><Icon name="clock" size={16} />До 30 минут в одном блоке</span>
      </section>

      <form className="panel planner-settings" onSubmit={applySettings} aria-label="Настройки плана">
        <div className="section-heading"><h2>Твой темп</h2><span className="subtle-label">{timezone}</span></div>
        <div className="planner-settings-row">
          <label htmlFor="planner-limit">Дневной лимит, минут
            <input id="planner-limit" type="number" min="15" max="480" step="1" required
              value={draft.daily_limit} onChange={(event) => setDraft((current) => ({ ...current, daily_limit: event.target.value }))} />
          </label>
          <label htmlFor="planner-horizon">Период плана
            <select id="planner-horizon" value={draft.horizon_days} onChange={(event) => setDraft((current) => ({ ...current, horizon_days: Number(event.target.value) }))}>
              <option value="7">7 дней</option><option value="14">14 дней</option><option value="30">30 дней</option>
            </select>
          </label>
        </div>
        <details className="planner-busy-settings"><summary>Учесть другие дела по дням</summary>
          <p className="section-hint">Сколько минут внутри дневного лимита уже занято? Задания StudyFlow учитываются автоматически.</p>
          <div className="planner-busy-grid">{upcomingDays.map((key) => <label key={key} htmlFor={`busy-${key}`}>
            {dateFromDayKey(key).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "2-digit" })}
            <input id={`busy-${key}`} type="number" min="0" max="1440" step="1"
              value={draft.busy_minutes[key] ?? 0} onChange={(event) => changeBusy(key, event.target.value)} />
          </label>)}</div>
        </details>
        {settingsError && <p className="error" role="alert">{settingsError}</p>}
        <button type="submit">Обновить план</button>
      </form>

      {loading && <LoadingState detail="Учитываем дедлайны, дневной лимит и другие дела.">Распределяем работу по дням…</LoadingState>}
      {error && <div className="error" role="alert"><span>{error}</span>
        <button className="secondary" onClick={() => setRetry((value) => value + 1)}>Повторить планирование</button></div>}

      {plan && <>
        <div className="planner-summary" aria-label="Итоги плана">
          <div><span>Запланировано</span><strong>{formatDuration(plan.planned_minutes)}</strong></div>
          <div><span>Не поместилось</span><strong className={plan.unplanned_minutes ? "planner-attention" : ""}>{formatDuration(plan.unplanned_minutes)}</strong></div>
          <div><span>Осталось заданий</span><strong>{plan.pending_tasks}</strong></div>
        </div>

        {plan.warnings.length > 0 && <section className="planner-notices" aria-label="Предупреждения плана" role="alert">
          <h2>Обрати внимание</h2>
          {plan.warnings.map((warning, index) => <div key={index}><strong>{warning.message}</strong>
            {warning.suggestion && <p>{warning.suggestion}</p>}</div>)}
        </section>}
        {plan.suggestions.length > 0 && <section className="planner-advice" aria-label="Ранний старт">
          <h2>Часть работы — раньше</h2>
          {plan.suggestions.map((suggestion, index) => <div key={index}><strong>{suggestion.message}</strong><p>{suggestion.suggestion}</p></div>)}
        </section>}

        <div className="section-heading planner-days-heading"><h2>План по дням</h2>
          <button className="text-button" onClick={() => setShowEmpty((value) => !value)}>{showEmpty ? "Скрыть свободные дни" : "Показать все дни"}</button></div>
        <div className="planner-days" aria-busy={loading}>
          {plan.days.filter((day, index) => showEmpty || day.total_minutes > 0 || index < 3).map((day) => (
            <section key={day.date} data-plan-day={day.date} className={`panel planner-day ${day.overloaded ? "overloaded" : ""}`}>
              <div className="section-heading"><div><h3>{labelForDay(day.date, today)}</h3>
                <span className="subtle-label">{dateFromDayKey(day.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</span></div>
                <strong className="planner-day-total">{formatDuration(day.minutes)}</strong></div>
              <div className="planner-load-track" role="meter" aria-label="Дневная нагрузка"
                aria-valuemin={0} aria-valuemax={Math.max(plan.daily_limit, day.total_minutes)} aria-valuenow={day.total_minutes}
                aria-valuetext={`${formatDuration(day.total_minutes)} из ${formatDuration(plan.daily_limit)}`}>
                <span style={{ width: `${Math.min(100, day.total_minutes / plan.daily_limit * 100)}%` }} /></div>
              <p className="planner-day-hint">Учёба: {formatDuration(day.minutes)} · другие дела: {formatDuration(day.busy_minutes)} · лимит: {formatDuration(plan.daily_limit)}</p>
              {day.sessions.length === 0 ? <p className="planner-free">Учебных блоков нет.</p> : <ul className="planner-sessions">
                {day.sessions.map((session, index) => {
                  const task = tasks.find((item) => item.id === session.task_id);
                  return <li key={`${session.task_id}-${index}`} className="planner-session" data-task-id={session.task_id}>
                    <div className="planner-session-top"><strong>{session.subject} — {session.minutes} мин</strong>
                      <span className={`difficulty-badge ${session.difficulty}`}>{difficultyLabels[session.difficulty]}</span></div>
                    <p>{session.topic}</p>
                    <small>{session.parts > 1 ? `Блок ${session.part} из ${session.parts}. ` : ""}Всего: {session.task_total_minutes} мин · дедлайн {new Date(session.deadline).toLocaleString("ru-RU", { day: "numeric", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {session.overdue && " · просрочено"}</small>
                    {task && <div className="actions">
                      {taskActions.onOpenTutor && <button className="secondary" disabled={taskActions.disabled} onClick={() => taskActions.onOpenTutor(task)}>Разобрать тему</button>}
                      <button className="secondary" disabled={taskActions.disabled} onClick={() => taskActions.onEdit(task)}>Изменить задание</button>
                      <button className="secondary" disabled={taskActions.disabled} onClick={() => taskActions.onComplete(task.id)}>Всё задание выполнено</button>
                    </div>}
                  </li>;
                })}
              </ul>}
            </section>
          ))}
        </div>
        <p className="section-hint">Отметка выполнения относится ко всему заданию. После частичной работы укажи оставшееся время в форме редактирования.</p>
      </>}
    </div>
  );
}
