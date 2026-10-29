import { useEffect, useMemo, useRef, useState } from "react";
import Dashboard from "./components/Dashboard";
import Calendar from "./components/Calendar";
import TaskForm from "./components/TaskForm";
import PhotoTaskForm from "./components/PhotoTaskForm";
import TaskList from "./components/TaskList";
import SmartPlanner from "./components/SmartPlanner";
import AITutor from "./components/AITutor";
import KnowledgeMap from "./components/KnowledgeMap";
import { localDayKey } from "./utils/dates";
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  userStorageKey,
} from "./api";
import { Brand, Icon, EmptyState, PageSkeleton } from "./components/UI";
import Drawer from "./components/Drawer";
import StartPage from "./components/StartPage";
import "./styles.css";

function Navigation({ pages, view, onNavigate }) {
    return <nav aria-label="Разделы StudyFlow">{[pages.slice(0,4), pages.slice(4)].map((group, index) => <div className="nav-group" key={index}><p className="nav-caption">{index === 0 ? "ПЛАНИРОВАНИЕ" : "ОБУЧЕНИЕ"}</p>{group.map(page => <button key={page.id} className={`nav-button ${view === page.id ? "active" : ""}`} aria-current={view === page.id ? "page" : undefined} onClick={() => onNavigate(page.id)}><Icon name={page.icon} /><span>{page.title}</span>{view === page.id && <span className="nav-active-dot" />}</button>)}</div>)}</nav>;
  }


function AccountPanel({ user, onSignOut, signingOut }) {
  return <div className="account-card"><span className="account-avatar" aria-hidden="true">{(user?.name || user?.email || "У").slice(0, 1).toUpperCase()}</span><div><strong>{user?.name || "Мой аккаунт"}</strong><small>{user?.email}</small></div><button className="text-button" onClick={onSignOut} disabled={signingOut}>{signingOut ? "Выходим…" : "Выйти"}</button></div>;
}

export default function App({ user, onSignOut, signingOut }) {
  const [tasks, setTasks] = useState([]);
  const [editingTask, setEditingTask] = useState(null);
  const [formMode, setFormMode] = useState("manual");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState("dashboard");
  const [tutorTopic, setTutorTopic] = useState(null);
  const [knowledgeRevision, setKnowledgeRevision] = useState(0);
  const [knowledgeTarget, setKnowledgeTarget] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => localDayKey(new Date()));
  const [entered, setEntered] = useState(() => {
    return true;
  });
  const [formOpen, setFormOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const mutationLock = useRef(false);
  const creationAttempts = useRef({});
  const taskLoad = useRef(null);
  const taskLoadVersion = useRef(0);

  async function createOnce(data, kind) {
    const fingerprint = JSON.stringify(data);
    if (creationAttempts.current[kind]?.fingerprint !== fingerprint) {
      creationAttempts.current[kind] = { fingerprint, id: crypto.randomUUID() };
    }
    const created = await createTask(data, creationAttempts.current[kind].id);
    delete creationAttempts.current[kind];
    return created;
  }

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  function enterApp() {
    try { localStorage.setItem(userStorageKey("entered"), "true"); } catch { /* Доступ к хранилищу необязателен. */ }
    setEntered(true);
    requestAnimationFrame(() => document.getElementById("main-content")?.focus({ preventScroll: true }));
  }

  function navigate(page) { setView(page); setMenuOpen(false); }
  function openNewTask() { setFormMode("photo"); setEditingTask(null); setFormOpen(true); }


  // Обновляем «сегодня» и просроченные дедлайны, даже если вкладка открыта ночью.
  useEffect(() => {
    const refreshTime = () => setNow(new Date());
    const timer = window.setInterval(refreshTime, 60_000);
    window.addEventListener("focus", refreshTime);
    document.addEventListener("visibilitychange", refreshTime);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshTime);
      document.removeEventListener("visibilitychange", refreshTime);
    };
  }, []);

  async function loadTasks() {
    const version = ++taskLoadVersion.current;
    taskLoad.current?.abort();
    const controller = new AbortController();
    taskLoad.current = controller;
    setLoading(true);
    try {
      const loaded = await getTasks(controller.signal);
      if (version !== taskLoadVersion.current || controller.signal.aborted) return;
      setTasks(loaded);
      setLoadFailed(false);
      setError("");
    } catch (failure) {
      if (version !== taskLoadVersion.current || controller.signal.aborted) return;
      setLoadFailed(true);
      setError(failure instanceof TypeError ? "Не удалось загрузить задания. Проверь, что сервер запущен, и повтори загрузку." : failure.message);
    } finally {
      if (version === taskLoadVersion.current) {
        taskLoad.current = null;
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadTasks();
    return () => {
      taskLoadVersion.current += 1;
      taskLoad.current?.abort();
    };
  }, []);

  async function handleSubmit(data) {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setBusy(true);
    setError("");
    try {
      if (editingTask) {
        const updated = await updateTask(editingTask.id, data);
        setTasks((current) => current.map((task) => task.id === updated.id ? updated : task));
        setEditingTask(null);
      } else {
        const created = await createOnce(data, "manual");
        setTasks((current) => [...current, created]);
      }
      setFormOpen(false);
      setNotice(editingTask ? "Изменения сохранены" : "Задание добавлено");
      return true;
    } catch (failure) {
      setError(failure instanceof TypeError ? "Не удалось сохранить задание. Проверь подключение и повтори — введённые данные остались в форме." : failure.message);
      return false;
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);
    setError("");
    try {
      await deleteTask(id);
      setTasks((current) => current.filter((task) => task.id !== id));
      if (editingTask?.id === id) setEditingTask(null);
      setNotice("Задание удалено");
    } catch (failure) {
      setError(failure instanceof TypeError ? "Не удалось удалить задание. Проверь подключение и повтори." : failure.message);
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }

  async function handleConfirmPhoto(data) {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setBusy(true);
    setError("");
    try {
      // Фото всегда создаёт новое задание, даже если ручная форма редактирует другое.
      const created = await createOnce(data, "photo");
      setTasks((current) => [...current, created]);
      setFormOpen(false);
      setView("planner");
      setNotice("Задание сохранено — Smart Planner обновляет план");
      return true;
    } catch (failure) {
      throw new Error(failure instanceof TypeError ? "Не удалось сохранить задание. Проверь подключение и повтори." : failure.message);
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }

  async function handleComplete(id) {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);
    setError("");
    try {
      const completed = await completeTask(id);
      setTasks((current) => current.map((task) => task.id === id ? completed : task));
      setNotice("Задание выполнено");
    } catch (failure) {
      setError(failure instanceof TypeError ? "Не удалось отметить задание выполненным. Проверь подключение и повтори." : failure.message);
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }

  const sortedTasks = useMemo(() => [...tasks].sort((a, b) =>
    new Date(a.deadline) - new Date(b.deadline) || a.id - b.id
  ), [tasks]);

  function handleEdit(task) {
    setFormMode("manual");
    setEditingTask(task);
    setFormOpen(true);
  }

  function openCalendar(day) {
    setSelectedDay(day);
    setView("calendar");
  }

  const taskActions = {
    onEdit: handleEdit,
    onDelete: handleDelete,
    onComplete: handleComplete,
    onOpenTutor: (task) => { setTutorTopic({ ...task, action: "explain" }); setView("tutor"); },
    disabled: busy || loading || loadFailed,
  };
  const pages = [
    { id: "dashboard", title: "Dashboard", icon: "overview" },
    { id: "tasks", title: "Мои задания", icon: "tasks" },
    { id: "calendar", title: "Календарь", icon: "calendar" },
    { id: "planner", title: "Smart Planner", icon: "planner" },
    { id: "tutor", title: "AI Tutor", icon: "tutor" },
    { id: "knowledge", title: "Knowledge Map", icon: "knowledge" },
  ];
  const headings = { dashboard: "Твой учебный день", calendar: "Календарь заданий", planner: "Твой план учёбы", tasks: "Мои задания", tutor: "Разберём тему вместе", knowledge: "Твоя карта знаний" };
  const hints = {
    dashboard: "Всё важное перед глазами. Двигайся в своём темпе.",
    calendar: "Выбери дату и посмотри, что нужно успеть.",
    planner: "Начни раньше и распределяй работу в своём темпе.",
    tasks: "Ближайшие дедлайны — в начале списка.",
    tutor: "Понятное объяснение, практика и пять вопросов для самопроверки.",
    knowledge: "Что уже получается, где есть ошибки и с чего начать повторение.",
  };

  const taskUnavailable = busy || loading || loadFailed;
  return <>
    <div hidden={entered}><StartPage onEnter={enterApp} /></div>
    <div className="app-shell" hidden={!entered} inert={formOpen || menuOpen}>
      <a className="skip-link" href="#main-content">К содержимому</a>
      <aside className="sidebar">
        <Brand onClick={() => setEntered(false)} />
        <Navigation pages={pages} view={view} onNavigate={navigate} />
        <div className="sidebar-note"><Icon name="spark" /><div><strong>В своём темпе</strong><span>Один понятный шаг за другим.</span></div></div>
        <AccountPanel user={user} onSignOut={onSignOut} signingOut={signingOut} />
        <div className="sidebar-footer"><span className="status-dot" />Личное пространство</div>
      </aside>
      <div className="app-body">
        <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu-button" aria-label="Открыть меню" onClick={() => setMenuOpen(true)}><Icon name="menu" /></button><span className="topbar-product">StudyFlow</span><Icon name="chevron" size={14} /><strong>{pages.find(page => page.id === view)?.title}</strong></div><span className="topbar-date"><Icon name="calendar" size={16} />{now.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</span><button className="add-task-button" onClick={openNewTask} disabled={taskUnavailable}><Icon name="plus" />Новое задание</button></header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          <header className="page-header"><div><p className="eyebrow">{view === "dashboard" ? now.toLocaleDateString("ru-RU", { weekday: "long" }) : "ТВОЯ УЧЁБА"}</p><h1>{headings[view]}</h1><p className="subtitle">{hints[view]}</p></div>{view === "dashboard" && <span className="page-tag"><span className="status-dot" /> Всё в одном месте</span>}</header>
          {error && !formOpen && (!loadFailed || view === "tutor" || view === "knowledge") && <div className="error" role="alert"><Icon name="warning" /><span>{error}</span>{loadFailed && <button className="secondary" disabled={loading} onClick={loadTasks}>Повторить загрузку</button>}</div>}
          <div className="workspace"><div className="view-content">
            <div hidden={view !== "tutor"}><AITutor initialTopic={tutorTopic} visible={entered && view === "tutor"} onTestCompleted={() => setKnowledgeRevision(value => value + 1)} onOpenKnowledgeMap={result => { setKnowledgeTarget({ topicKey: result.topic_key }); setView("knowledge"); }} /></div>
            <div hidden={view !== "knowledge"}><KnowledgeMap visible={entered && view === "knowledge"} revision={knowledgeRevision} initialTarget={knowledgeTarget} tasks={tasks} onOpenTutor={target => { if (target) setTutorTopic({ ...target }); setView("tutor"); }} /></div>
            {view !== "tutor" && view !== "knowledge" && (loading ? <PageSkeleton /> : loadFailed ? <section className="panel load-error" role="alert"><EmptyState icon="warning" title="Задания пока недоступны" description="Проверь, что сервер StudyFlow запущен, и повтори загрузку." action={<button onClick={loadTasks}>Повторить загрузку</button>} /></section> : view === "dashboard" ? <Dashboard tasks={sortedTasks} now={now} taskActions={taskActions} onOpenCalendar={openCalendar} onOpenTasks={() => setView("tasks")} onOpenPlanner={() => setView("planner")} onNewTask={openNewTask} /> : view === "calendar" ? <Calendar tasks={sortedTasks} today={localDayKey(now)} selectedDay={selectedDay} onSelectDay={setSelectedDay} taskActions={taskActions} /> : view === "planner" ? <SmartPlanner tasks={sortedTasks} now={now} taskActions={taskActions} /> : <section className="panel assignments-panel" aria-label="Все задания"><div className="section-heading"><div className="heading-with-count"><h2>Все задания</h2><span className="count-badge">{tasks.length}</span></div><span className="subtle-label">По ближайшему дедлайну</span></div><TaskList tasks={sortedTasks} {...taskActions} emptyMessage="Добавь первое задание" emptyDescription="Укажи тему и дедлайн. StudyFlow поможет увидеть нагрузку и спланировать работу." emptyAction={<button onClick={openNewTask}><Icon name="plus" />Добавить задание</button>} /></section>)}
          </div></div>
        </main>
      </div>
    </div>
    <Drawer open={entered && menuOpen} onClose={() => setMenuOpen(false)} title="Разделы" id="navigation" side="left"><Navigation pages={pages} view={view} onNavigate={navigate} /><AccountPanel user={user} onSignOut={onSignOut} signingOut={signingOut} /></Drawer>
    <Drawer open={entered && formOpen} onClose={() => setFormOpen(false)} title={editingTask && formMode === "manual" ? "Изменить задание" : "Новое задание"} id="task">
      <p className="drawer-description">Добавь детали — остальное станет частью твоего плана.</p>
      <div className="form-mode-switch" aria-label="Способ добавления задания"><button type="button" aria-pressed={formMode === "manual"} disabled={busy} onClick={() => setFormMode("manual")}><Icon name="edit" size={17} />Вручную</button><button type="button" aria-pressed={formMode === "photo"} disabled={busy} onClick={() => setFormMode("photo")}><Icon name="photo" size={17} />По фото</button></div>
      {error && <div className="error" role="alert"><Icon name="warning" /><span>{error}</span></div>}
      {/* Формы остаются смонтированными: закрытие панели и навигация сохраняют черновики. */}
      <div hidden={formMode !== "manual"}><TaskForm onSubmit={handleSubmit} editingTask={editingTask} onCancelEdit={() => { setEditingTask(null); setFormOpen(false); }} disabled={taskUnavailable} saving={busy} /></div>
      <div hidden={formMode !== "photo"}><PhotoTaskForm onConfirm={handleConfirmPhoto} disabled={taskUnavailable} /></div>
    </Drawer>
    {entered && notice && <div className="toast" role="status"><span className="toast-icon"><Icon name="check" size={17} /></span>{notice}<button className="icon-button" onClick={() => setNotice("")} aria-label="Закрыть уведомление"><Icon name="close" size={16} /></button></div>}
  </>;
}
