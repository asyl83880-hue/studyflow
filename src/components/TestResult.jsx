const errorLabels = {
  concept: "Понимание правила", calculation: "Вычисление", reading: "Чтение условия",
  procedure: "Последовательность шагов", other: "Другая ошибка", none: "Без ошибки",
};

export default function TestResult({ result, onRepeat, onNewTest, onOpenKnowledgeMap, disabled }) {
  return <section className="panel test-result" aria-labelledby="test-result-title">
    <div className="section-heading"><h2 id="test-result-title">Результат мини-теста</h2><span className="task-status done">Сохранён</span></div>
    <div className="test-score"><strong>{result.correct_count} из {result.total_count}</strong><span>правильных ответов · {result.score_percent}%</span></div>
    <p className="section-description">{result.subject} · {result.topic} · {new Date(result.completed_at).toLocaleString("ru-RU")}</p>
    <div className="test-diagnostics">
      <h3>{result.problem_topics.length ? "Стоит повторить" : "Все ответы верные"}</h3>
      {result.problem_topics.length ? <ul>{result.problem_topics.map((topic) => <li key={topic.concept_key}>
        <strong>{topic.concept_label}</strong> — ошибок: {topic.incorrect_count} из {topic.total_count}.
        <span className="muted"> {topic.error_types.map((type) => errorLabels[type]).join(", ")}.</span>
      </li>)}</ul> : <p>Попробуй более сложное задание, чтобы потренироваться дальше.</p>}
      <p className="muted">Пять вопросов показывают, что получилось в этой попытке. Это ещё не оценка всей темы.</p>
    </div>
    <div className="tutor-result-actions">
      <button type="button" className="secondary" onClick={onRepeat} disabled={disabled}>Повторить объяснение</button>
      <button type="button" className="secondary" onClick={onNewTest} disabled={disabled}>Новый мини-тест</button>
      {onOpenKnowledgeMap && <button type="button" onClick={() => onOpenKnowledgeMap(result)}>Открыть карту знаний</button>}
    </div>
    <h3>Разбор ответов</h3>
    <div className="answer-reviews">{result.answers.map((answer, index) => {
      const choiceText = (id) => answer.choices.find((choice) => choice.id === id)?.text;
      return <details key={answer.question_id} className={`answer-review ${answer.is_correct ? "correct" : "incorrect"}`} open={!answer.is_correct}>
        <summary><span>{index + 1}. {answer.prompt}</span><b>{answer.is_correct ? "Верно" : "Ошибка"}</b></summary>
        <p><strong>Твой ответ:</strong> {choiceText(answer.selected_choice_id)}</p>
        {!answer.is_correct && <p><strong>Правильный ответ:</strong> {choiceText(answer.correct_choice_id)}</p>}
        <p className="tutor-text">{answer.feedback}</p>
        <p className="tutor-text"><strong>Почему:</strong> {answer.explanation}</p>
        <small>{answer.concept_label} · {errorLabels[answer.error_type]}</small>
      </details>;
    })}</div>
  </section>;
}
