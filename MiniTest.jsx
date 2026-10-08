export default function MiniTest({ test, selections, onSelect, onSubmit, disabled }) {
  const answered = test.questions.filter((question) => selections[question.id]).length;
  return <section className="panel mini-test" aria-labelledby="mini-test-title">
    <div className="section-heading">
      <h2 id="mini-test-title">{test.title}</h2>
      <span className="count-badge">Ответов: {answered}/5</span>
    </div>
    <p className="section-description">Выбери один ответ в каждом вопросе. Разбор появится после сдачи.</p>
    <div className="test-progress"><span>Твой прогресс</span><strong>{answered} из 5</strong><div className="progress-track" role="progressbar" aria-label="Ответы в мини-тесте" aria-valuemin={0} aria-valuemax={5} aria-valuenow={answered}><span style={{ width: `${answered / 5 * 100}%` }} /></div></div>
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      {test.questions.map((question, index) => <fieldset key={question.id} className={`test-question ${selections[question.id] ? "answered" : ""}`} disabled={disabled}>
        <legend>{index + 1}. {question.prompt}</legend>
        <div className="test-options">
          {question.choices.map((choice) => <label key={choice.id} className={`test-option ${selections[question.id] === choice.id ? "selected" : ""}`}>
            <input type="radio" name={`${test.id}-${question.id}`} value={choice.id}
              checked={selections[question.id] === choice.id} onChange={() => onSelect(question.id, choice.id)} />
            <span><b>{choice.id}.</b> {choice.text}</span>
          </label>)}
        </div>
      </fieldset>)}
      <div className="test-submit-row">
        <button type="submit" disabled={disabled || answered !== 5}>{disabled ? "Сохраняем результат…" : "Завершить тест"}</button>
        <span className="muted">{answered !== 5 ? `Осталось ответить: ${5 - answered}` : "Все пять ответов выбраны."}</span>
      </div>
    </form>
  </section>;
}
