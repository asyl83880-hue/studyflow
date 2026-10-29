export function Icon({ name, size = 20, ...props }) {
  const paths = {
    overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    calendar: "M4 5h16v16H4z M8 3v4 M16 3v4 M4 11h16",
    planner: "M4 5h16v16H4z M8 3v4 M16 3v4 M8 13l3 3 5-6",
    tasks: "M9 6h11 M9 12h11 M9 18h11 M3 6l1 1 2-2 M3 12l1 1 2-2 M3 18l1 1 2-2",
    tutor: "M12 6c-3-3-7-3-10-2v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-7-1-10 2z M12 6v15",
    knowledge: "M3 4h7v6H3z M14 14h7v6h-7z M3 14h7v6H3z M6 10v4 M10 7h7v7",
    plus: "M12 5v14 M5 12h14",
    arrow: "M4 12h16 M14 6l6 6-6 6",
    chevron: "M9 5l7 7-7 7",
    close: "M6 6l12 12 M6 18L18 6",
    menu: "M4 6h16 M4 12h16 M4 18h16",
    clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
    check: "M5 12l4 4L19 6",
    edit: "M14 5l5 5 M4 20l4-1L20 7l-3-3L5 16z",
    trash: "M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
    spark: "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
    warning: "M12 3L2 21h20z M12 9v5 M12 17h.01",
    photo: "M3 6h4l2-3h6l2 3h4v15H3z M12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
    levels: "M5 19v-4 M12 19V9 M19 19V3",
    play: "M8 4l12 8-12 8z",
    book: "M5 3h14v18H5z M8 7h8 M8 11h6",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.book} /></svg>;
}

export function Brand({ onClick, compact = false }) {
  const contents = <><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M8 10h10a5 5 0 0 1 0 10h-4 M24 22H14a5 5 0 0 1 0-10h4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span><span className="brand-text"><strong>StudyFlow</strong>{!compact && <span>Пространство для учёбы</span>}</span></>;
  return onClick ? <button className="brand" onClick={onClick} title="На стартовую страницу">{contents}</button> : <div className="brand">{contents}</div>;
}

export function EmptyState({ icon = "tasks", title, description, action, compact = false }) {
  return <div className={`empty-state ${compact ? "compact" : ""}`}><span className="empty-icon"><Icon name={icon} size={24} /></span><h3>{title}</h3>{description && <p>{description}</p>}{action && <div className="empty-action">{action}</div>}</div>;
}

export function LoadingState({ children = "Загружаем…", detail }) {
  return <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" /><div><strong>{children}</strong>{detail && <p>{detail}</p>}</div></div>;
}

export function PageSkeleton() {
  return <div className="page-skeleton" role="status" aria-label="Загружаем задания"><span className="visually-hidden">Загружаем задания…</span><div className="skeleton-stats">{[0,1,2,3].map(n => <div className="skeleton-card" key={n}><i className="skeleton-line short" /><i className="skeleton-line number" /><i className="skeleton-line" /></div>)}</div><div className="skeleton-card skeleton-large"><i className="skeleton-line short" /><i className="skeleton-line" /><i className="skeleton-line" /></div></div>;
}
