import { useEffect, useState } from "react";
import { checkDemoAccess, getAccessCode, setAccessCode } from "../api";
import { Brand, Icon } from "./UI";
import StartPage from "./StartPage";

const required = import.meta.env.VITE_REQUIRE_ACCESS_CODE === "true";

export default function HostingAccess({ children }) {
  const [accepted, setAccepted] = useState(!required);
  const [showCode, setShowCode] = useState(Boolean(getAccessCode()));
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(required && Boolean(getAccessCode()));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!required || !getAccessCode()) return;
    let active = true;
    checkDemoAccess().then(() => { if (active) setAccepted(true); })
      .catch(failure => { if (active) { setAccessCode(""); setError(failure.message); } })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function enter(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setAccessCode(code.trim());
    try {
      await checkDemoAccess();
      try { localStorage.setItem("studyflow-ui-entered-v1", "true"); } catch { /* Optional browser storage. */ }
      setAccepted(true);
      setCode("");
    } catch (failure) {
      setAccessCode("");
      setError(failure instanceof TypeError ? "Не удалось подключиться. Проверь интернет и повтори." : failure.message);
    } finally { setBusy(false); }
  }

  if (accepted) return children;
  if (!showCode) return <StartPage onEnter={() => setShowCode(true)} />;
  return <main className="hosting-access"><section className="panel hosting-access-card">
    <Brand compact />
    <p className="eyebrow">ДЕМОНСТРАЦИЯ STUDYFLOW</p>
    <h1>Добро пожаловать</h1>
    <p className="subtitle">Введи код, который тебе передал автор проекта.</p>
    <form onSubmit={enter}>
      <label htmlFor="demo-access-code">Код доступа</label>
      <input id="demo-access-code" type="password" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" required disabled={busy} />
      {error && <div className="error" role="alert">{error}</div>}
      <button type="submit" disabled={busy || !code.trim()}><Icon name="arrow" />{busy ? "Проверяем доступ…" : "Войти в демо"}</button>
    </form>
    <p className="hosting-demo-note">В этом демо задания и результаты общие для участников. Используй учебные примеры без личных данных.</p>
    <button className="text-button" onClick={() => setShowCode(false)}>На главную</button>
  </section></main>;
}
