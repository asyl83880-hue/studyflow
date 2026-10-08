import { useEffect, useMemo, useRef, useState } from "react";
import { getKnowledgeMap } from "../api";
import { Icon, EmptyState, LoadingState } from "./UI";

const statuses = {
  mastered: { label: "Освоено", short: "Освоено" },
  good: { label: "Хороший уровень", short: "Хорошо" },
  needs_practice: { label: "Нужна практика", short: "Практика" },
  weak: { label: "Слабый уровень", short: "Слабые" },
  not_studied: { label: "Ещё нет тестов", short: "Нет тестов" },
};
const errorLabels = { concept: "Понимание правила", calculation: "Вычисления", reading: "Чтение условия", procedure: "Порядок действий", other: "Другие ошибки" };
const priority = { weak: 0, needs_practice: 1, not_studied: 2, good: 3, mastered: 4 };
const contains = (value, query) => value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е").includes(query);
const countLabel = (count, forms) => {
  const mod10 = count % 10, mod100 = count % 100;
  return `${count} ${forms[mod10 === 1 && mod100 !== 11 ? 0 : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 1 : 2]}`;
};
const formatDate = (value) => new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

function StatusBadge({ status }) {
  return <span className="km-status" data-status={status}><span aria-hidden="true" />{statuses[status].label}</span>;
}

function MapRow({ node, active, onSelect, concept = false }) {
  return <button type="button" className={`km-node ${concept ? "km-concept" : "km-topic"} ${active ? "selected" : ""}`}
    aria-pressed={active} onClick={onSelect}>
    <span className="km-node-name">{concept && <span className="km-branch" aria-hidden="true" />}{node.label}</span>
    <span className="km-node-evidence">{node.attempts ? `${node.score_percent}% · ${node.attempts} поп.` : "Нет результатов"}</span>
    <StatusBadge status={node.status} />
  </button>;
}

export default function KnowledgeMap({ visible, revision, initialTarget, tasks, onOpenTutor }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const detailRef = useRef(null);
  const treeRef = useRef(null);
  const focusedTarget = useRef(null);

  useEffect(() => {
    if (!initialTarget) return;
    setSubjectFilter("all"); setStatusFilter("all"); setSearch("");
    setSelected(initialTarget.topicKey);
  }, [initialTarget]);

  useEffect(() => {
    if (!visible || loading || !data || !initialTarget || focusedTarget.current === initialTarget) return;
    if (!window.matchMedia("(max-width: 1100px)").matches) { focusedTarget.current = initialTarget; return; }
    const frame = requestAnimationFrame(() => {
      focusedTarget.current = initialTarget;
      detailRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      detailRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, loading, data, initialTarget]);

  function selectNode(id) {
    setSelected(id);
    if (window.matchMedia("(max-width: 1100px)").matches) requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      detailRef.current?.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let current = true;
    setLoading(true); setError("");
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    getKnowledgeMap(controller.signal).then((result) => {
      if (current) setData(result);
    }).catch(() => {
      if (current) setError("Не удалось обновить карту знаний. Проверь сервер и повтори загрузку.");
    }).finally(() => {
      window.clearTimeout(timer);
      if (current) setLoading(false);
    });
    return () => { current = false; controller.abort(); window.clearTimeout(timer); };
  }, [visible, revision, tasks, refresh]);

  useEffect(() => {
    if (!visible) return;
    const update = () => { if (!document.hidden) setRefresh((value) => value + 1); };
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, [visible]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
    return (data?.subjects || []).filter((subject) => subjectFilter === "all" || subject.subject_key === subjectFilter)
      .map((subject) => ({ ...subject, topics: subject.topics.flatMap((topic) => {
        const matches = contains(`${subject.label} ${topic.label}`, query);
        const concepts = topic.concepts.filter((concept) => (matches || contains(concept.label, query))
          && (statusFilter === "all" || concept.status === statusFilter));
        const rootMatches = matches && (statusFilter === "all" || topic.status === statusFilter);
        return rootMatches || concepts.length ? [{ ...topic, visibleConcepts: concepts }] : [];
      }) })).filter((subject) => subject.topics.length);
  }, [data, subjectFilter, statusFilter, search]);

  const targets = filtered.flatMap((subject) => subject.topics.flatMap((topic) => [
    { id: topic.topic_key, subject, topic, node: topic, concept: false },
    ...topic.visibleConcepts.map((node) => ({ id: node.concept_key, subject, topic, node, concept: true })),
  ]));
  const query = search.trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
  const candidates = targets.filter((target) => (statusFilter === "all" || target.node.status === statusFilter)
    && contains(`${target.subject.label} ${target.node.label}`, query));
  const active = targets.find((target) => target.id === selected)
    || [...candidates].sort((a, b) => priority[a.node.status] - priority[b.node.status])[0];
  const node = active?.node;

  function changeFilter(update, value) { update(value); setSelected(null); }
  function openRecommendation(step) {
    if (!active) return;
    onOpenTutor({
      subject: active.subject.label, topic: active.topic.label,
      student_level: node.student_level,
      focus_concept: active.concept ? node.label : null,
      action: step.action, practice_goal: step.exercise_count,
    });
  }

  return <div className="knowledge-view" aria-busy={loading}>
    <section className="km-intro">
      <div><p className="eyebrow">KNOWLEDGE MAP</p><h2>Знай, что повторить дальше</h2>
        <p>Твои тесты складываются в карту тем и навыков. Выбери слабое место и сделай следующий шаг.</p></div>
      <span className="km-auto"><span className="status-dot" aria-hidden="true" />Обновляется после тестов</span>
    </section>

    {loading && <LoadingState>Обновляем карту знаний…</LoadingState>}
    {error && <div className="error" role="alert"><span>{error}{data ? " Ниже — последняя загруженная карта." : ""}</span>
      <button type="button" className="secondary" onClick={() => setRefresh((value) => value + 1)}>Повторить загрузку</button></div>}

    {data && <>
      <section className="km-summary" aria-label="Уровень по темам">
        {Object.entries(statuses).map(([status, info]) => <button type="button" key={status} data-status={status}
          className={`km-stat ${statusFilter === status ? "active" : ""}`} aria-pressed={statusFilter === status}
          onClick={() => changeFilter(setStatusFilter, statusFilter === status ? "all" : status)}>
          <span>{info.short}</span><strong>{data.summary.statuses[status]}</strong><small>{countLabel(data.summary.statuses[status], ["тема", "темы", "тем"]).split(" ")[1]}</small>
        </button>)}
      </section>

      <div className="km-meta"><span>{countLabel(data.summary.topics_total, ["тема", "темы", "тем"])} · {countLabel(data.summary.concepts_total, ["навык", "навыка", "навыков"])} · {countLabel(data.summary.completed_tests, ["сданный тест", "сданных теста", "сданных тестов"])}</span>
        <button type="button" className="text-button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Обновить карту</button></div>

      {data.summary.topics_total === 0 ? <section className="panel km-empty">
        <EmptyState icon="knowledge" title="Первые шаги появятся здесь" description="Добавь задание или пройди мини-тест в AI Tutor. Результат покажет, что уже получается." action={<button type="button" onClick={() => onOpenTutor(null)}>Открыть AI Tutor<Icon name="arrow" size={17} /></button>} />
      </section> : <>
        <form className="km-filters" aria-label="Фильтры карты знаний" onSubmit={(event) => event.preventDefault()}>
          <label>Найти тему<input value={search} maxLength={300} placeholder="Например, дискриминант"
            onChange={(event) => changeFilter(setSearch, event.target.value)} /></label>
          <label>Предмет<select value={subjectFilter} onChange={(event) => changeFilter(setSubjectFilter, event.target.value)}>
            <option value="all">Все предметы</option>{data.subjects.map((subject) => <option key={subject.subject_key} value={subject.subject_key}>{subject.label}</option>)}
          </select></label>
          <label>Уровень<select value={statusFilter} onChange={(event) => changeFilter(setStatusFilter, event.target.value)}>
            <option value="all">Все уровни</option>{Object.entries(statuses).map(([status, info]) => <option key={status} value={status}>{info.label}</option>)}
          </select></label>
        </form>

        {!filtered.length ? <section className="panel"><EmptyState icon="knowledge" title="Таких тем пока нет" description="Измени поиск или фильтры, чтобы увидеть другие темы." /></section> : <div className="km-layout">
          <div className="km-tree" ref={treeRef} tabIndex={-1} aria-label="Предметы, темы и навыки">
            {filtered.map((subject) => <section className="panel km-subject" key={subject.subject_key} aria-label={subject.label}>
              <div className="km-subject-heading"><div><span className="eyebrow">ПРЕДМЕТ</span><h2>{subject.label}</h2></div>
                <span className="count-badge">{countLabel(subject.topics.length, ["тема", "темы", "тем"])}</span></div>
              {subject.topics.map((topic) => <div className="km-topic-group" key={topic.topic_key}>
                <MapRow node={topic} active={active?.id === topic.topic_key} onSelect={() => selectNode(topic.topic_key)} />
                {topic.visibleConcepts.map((concept) => <MapRow key={concept.concept_key} node={concept} concept
                  active={active?.id === concept.concept_key} onSelect={() => selectNode(concept.concept_key)} />)}
              </div>)}
            </section>)}
          </div>

          {active && <aside className="panel km-detail" ref={detailRef} tabIndex={-1} aria-labelledby="knowledge-detail-title">
            <button type="button" className="text-button km-back" onClick={() => { treeRef.current?.scrollIntoView({ block: "start", behavior: "auto" }); treeRef.current?.focus({ preventScroll: true }); }}>← К списку тем</button>
            <p className="eyebrow">{active.concept ? "НАВЫК ВНУТРИ ТЕМЫ" : "ТЕМА"}</p>
            <h2 id="knowledge-detail-title">{node.label}</h2>
            <p className="km-detail-context">{active.subject.label}{active.concept ? ` · ${active.topic.label}` : ""}</p>
            <StatusBadge status={node.status} />
            <div className="km-score"><strong>{node.score_percent === null ? "—" : `${node.score_percent}%`}</strong>
              <span>{node.score_percent === null ? "Ещё нет ответов для оценки" : "по последним попыткам"}</span></div>
            <p className="km-reason">{node.reason}</p>
            {node.provisional && <p className="km-provisional">Пока мало данных. Продолжай проверять себя.</p>}
            <dl className="km-evidence"><div><dt>Попыток</dt><dd>{node.attempts}</dd></div>
              <div><dt>Ответов</dt><dd>{node.answered_count}</dd></div><div><dt>Всего ошибок</dt><dd>{node.incorrect_count}</dd></div></dl>

            {!!node.recent_results.length && <section className="km-recent" aria-label="Последние результаты">
              <h3>Последние попытки</h3>{node.recent_results.map((result, index) => <div className="km-attempt" key={result.test_id}>
                <span>{formatDate(result.completed_at)}{index === 0 ? " · последняя" : ""}</span>
                <strong>{result.correct_count}/{result.total_count}</strong><div className="km-attempt-track" aria-hidden="true"><span style={{ width: `${result.score_percent}%` }} /></div>
              </div>)}
            </section>}
            {!!node.recent_error_types.length && <section className="km-errors"><h3>Ошибки в последних тестах</h3>
              <ul>{node.recent_error_types.map((item) => <li key={item.error_type}><span>{errorLabels[item.error_type] || "Другие ошибки"}</span><b>{item.count}</b></li>)}</ul>
            </section>}

            <div className="km-recommendation"><h3>Твой следующий шаг</h3><p>{node.recommendation.message}</p>
              <div>{node.recommendation.steps.map((step, index) => <button type="button" key={step.action}
                className={index ? "secondary" : ""} onClick={() => openRecommendation(step)}>{step.label}<span aria-hidden="true"> →</span></button>)}</div>
            </div>
          </aside>}
        </div>}
      </>}

      <details className="panel km-rules"><summary>Как определяется уровень?</summary>
        <p>Смотрим на три последние сданные попытки. Последняя влияет сильнее. Меньше 50% — слабый уровень; от 50% до 75% — нужна практика; от 75% — хороший уровень.</p>
        <p>«Освоено» требует не менее трёх попыток, пяти ответов, среднего результата от 90% и двух последних результатов от 90%. Для целой темы это нужно подтвердить и по её проверенным навыкам.</p>
        <p>Плохой последний результат или повторяющиеся ошибки в правилах и шагах понижают уровень. Несданный тест и выполненное домашнее задание не доказывают освоение. Карта показывает темы из заданий и тестов, а не всю школьную программу.</p>
      </details>
    </>}
  </div>;
}
