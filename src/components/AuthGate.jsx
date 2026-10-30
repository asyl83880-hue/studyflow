import { useEffect, useRef, useState } from "react";
import { getAppConfig, getCurrentIdentity, setIdentity, userStorageKey } from "../api";
import { configureAuth, clearAuthToken } from "../auth";
import { Brand, Icon } from "./UI";
import StartPage from "./StartPage";
import App from "../App";

const signalKey = "studyflow-auth-signal";

function notifyOtherTabs() {
  try { localStorage.setItem(signalKey, crypto.randomUUID()); } catch { /* Focus also refreshes the session. */ }
}

function clearPrivateStorage() {
  try {
    const prefix = userStorageKey("");
    Object.keys(localStorage).filter(key => key.startsWith(prefix)).forEach(key => localStorage.removeItem(key));
    sessionStorage.removeItem("studyflow-demo-access");
  } catch { /* Browser storage is optional. */ }
}

export default function AuthGate() {
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [mode, setMode] = useState("signin");
  const [ready, setReady] = useState(false);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [otp, setOtp] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [retry, setRetry] = useState(0);
  const client = useRef(null);
  const activeUser = useRef(null);
  const version = useRef(0);
  const working = useRef(false);

  useEffect(() => {
    if (!resendAt) return;
    let timer;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      setResendSeconds(remaining);
      if (!remaining) window.clearInterval(timer);
    };
    update();
    if (resendAt > Date.now()) timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  function codeSent() {
    setResendAt(Date.now() + 60_000);
    setResendSeconds(60);
  }

  async function acceptUser(account, expectedVersion = version.current) {
    clearAuthToken();
    const identity = await getCurrentIdentity();
    if (expectedVersion !== version.current) return;
    if (!account || identity.id !== account.id) throw new Error("Не удалось подтвердить аккаунт. Войди снова.");
    setIdentity(identity.id);
    activeUser.current = account;
    setUser(account);
    setPassword(""); setConfirmation(""); setOtp(""); setError("");
  }

  useEffect(() => {
    let active = true;
    setBooting(true);
    getAppConfig().then(async config => {
      if (!active) return;
      if (!config.auth_url) throw new Error("Вход временно недоступен. Настройка сервиса ещё не завершена.");
      client.current = configureAuth(config.auth_url);
      setReady(true);
      const session = await client.current.getSession();
      if (!active) return;
      if (session.error) throw new Error("Не удалось проверить вход. Проверь подключение и повтори.");
      if (session.data?.user) await acceptUser(session.data.user);
    }).catch(failure => { if (active) setError(failure.message || "Не удалось подключиться. Повтори попытку."); })
      .finally(() => { if (active) setBooting(false); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    function expired() {
      version.current += 1;
      clearPrivateStorage(); clearAuthToken(); setIdentity(null);
      activeUser.current = null; setUser(null); setMode("signin"); setShowAuth(true);
      setError("Сессия завершилась. Войди снова — задания сохранены в аккаунте.");
    }
    async function refreshSession(event) {
      if (!client.current || working.current || (event.type === "storage" && event.key !== signalKey)) return;
      const previous = activeUser.current;
      const currentVersion = ++version.current;
      if (event.type === "storage") { activeUser.current = null; setUser(null); clearAuthToken(); }
      try {
        const { data, error: failure } = await client.current.getSession();
        if (currentVersion !== version.current || failure) return;
        if (!data?.user) {
          if (previous) expired();
        } else if (!previous || previous.id !== data.user.id || event.type === "storage") {
          await acceptUser(data.user, currentVersion);
        }
      } catch { /* A temporary connection failure must not erase the current view. */ }
    }
    window.addEventListener("studyflow-session-expired", expired);
    window.addEventListener("storage", refreshSession);
    window.addEventListener("focus", refreshSession);
    return () => {
      window.removeEventListener("studyflow-session-expired", expired);
      window.removeEventListener("storage", refreshSession);
      window.removeEventListener("focus", refreshSession);
    };
  }, []);

  function changeMode(next) {
    if (busy) return;
    setMode(next); setError(""); setNotice(""); setPassword(""); setConfirmation(""); setOtp("");
  }

  async function submit(event) {
    event.preventDefault();
    if (working.current || !client.current) return;
    if (["signup", "reset"].includes(mode) && password !== confirmation) { setError("Пароли не совпадают."); return; }
    working.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const accountEmail = email.trim();
      let result;
      if (mode === "forgot") {
        result = await client.current.emailOtp.sendVerificationOtp({ email: accountEmail, type: "forget-password" });
        if (!result.error) { codeSent(); setMode("reset"); setNotice("Если аккаунт существует, код восстановления отправлен на почту. Проверь также папку «Спам»."); }
      } else if (mode === "reset") {
        result = await client.current.emailOtp.resetPassword({ email: accountEmail, otp: otp.trim(), password });
        if (!result.error) { setMode("signin"); setPassword(""); setConfirmation(""); setOtp(""); setNotice("Пароль обновлён. Теперь войди в аккаунт."); }
      } else if (mode === "verify") {
        result = await client.current.emailOtp.verifyEmail({ email: accountEmail, otp: otp.trim() });
        if (!result.error) { setMode("signin"); setOtp(""); setNotice("Почта подтверждена. Войди в аккаунт."); }
      } else {
        result = mode === "signup"
          ? await client.current.signUp.email({ email: accountEmail, password, name: name.trim() })
          : await client.current.signIn.email({ email: accountEmail, password });
        if (!result.error) {
          const session = await client.current.getSession();
          if (session.error) throw new Error("Не удалось проверить вход. Проверь подключение и повтори попытку.");
          if (session.data?.user) { await acceptUser(session.data.user); notifyOtherTabs(); }
          else {
            const sent = await client.current.emailOtp.sendVerificationOtp({ email: accountEmail, type: "email-verification" });
            if (sent.error) throw new Error("Подтверди почту, прежде чем войти в аккаунт.");
            codeSent();
            setMode("verify"); setNotice("Введи код подтверждения из письма.");
          }
        }
      }
      if (result?.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") {
          const sent = await client.current.emailOtp.sendVerificationOtp({ email: accountEmail, type: "email-verification" });
          if (sent.error) throw new Error("Не удалось отправить код подтверждения. Повтори попытку позже.");
          codeSent();
          setMode("verify"); setNotice("Введи код подтверждения из письма.");
        } else {
          throw new Error(mode === "signin" ? "Не удалось войти. Проверь почту и пароль."
            : ["reset", "verify"].includes(mode) ? "Код неверный или истёк. Запроси новый код."
            : "Не удалось выполнить действие. Проверь поля и повтори попытку.");
        }
      }
    } catch (failure) {
      setError(failure instanceof TypeError ? "Не удалось подключиться. Проверь интернет и повтори." : failure.message);
    } finally { working.current = false; setBusy(false); }
  }

  async function resendCode() {
    if (working.current || !client.current || resendAt > Date.now() || !["verify", "reset"].includes(mode)) return;
    working.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await client.current.emailOtp.sendVerificationOtp({
        email: email.trim(), type: mode === "reset" ? "forget-password" : "email-verification",
      });
      if (result.error) throw new Error("Не удалось отправить код. Повтори попытку позже.");
      codeSent(); setOtp("");
      setNotice("Если аккаунт существует, новый код отправлен. Используй код из последнего письма; проверь также папку «Спам».");
    } catch (failure) {
      setError(failure instanceof TypeError ? "Не удалось подключиться. Проверь интернет и повтори." : failure.message);
    } finally { working.current = false; setBusy(false); }
  }

  async function signOut() {
    if (working.current) return;
    working.current = true; setSigningOut(true); setError("");
    try {
      const result = await client.current.signOut();
      if (result.error) throw new Error("Не удалось выйти. Повтори попытку.");
      version.current += 1; clearPrivateStorage(); clearAuthToken(); setIdentity(null);
      activeUser.current = null; setUser(null); setMode("signin"); setShowAuth(true); notifyOtherTabs();
    } catch (failure) { setError(failure.message); }
    finally { working.current = false; setSigningOut(false); }
  }

  if (user) return <>{error && <div className="auth-global-error" role="alert">{error}</div>}<App key={user.id} user={user} onSignOut={signOut} signingOut={signingOut} /></>;
  if (!showAuth) return <StartPage onEnter={() => { setShowAuth(true); }} />;
  const titles = { signin: "С возвращением", signup: "Твоё пространство для учёбы", forgot: "Восстановить доступ", reset: "Новый пароль", verify: "Подтверди почту" };
  const labels = { signin: "Войти", signup: "Создать аккаунт", forgot: "Отправить код", reset: "Сохранить пароль", verify: "Подтвердить почту" };
  return <main className="hosting-access"><section className="panel hosting-access-card auth-card">
    <Brand compact /><p className="eyebrow">ЛИЧНЫЙ АККАУНТ STUDYFLOW</p><h1>{titles[mode]}</h1>
    <p className="subtitle">{mode === "signup" ? "Твои задания, учебный план и прогресс — в одном месте." : "Продолжай учиться в своём темпе."}</p>
    {booting ? <p className="auth-status" role="status">Подключаемся и проверяем вход…</p> : <>
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      {error && <div className="error" role="alert">{error}</div>}
      {ready ? <form onSubmit={submit}>
        {mode === "signup" && <label>Как тебя зовут<input name="name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} maxLength={60} required disabled={busy} /></label>}
        <label>Электронная почта<input name="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required disabled={busy} readOnly={["verify", "reset"].includes(mode)} /></label>
        {["verify", "reset"].includes(mode) && <label>Код из письма<input name="otp" autoComplete="one-time-code" inputMode="numeric" value={otp} onChange={event => setOtp(event.target.value)} maxLength={12} required disabled={busy} /></label>}
        {["signin", "signup", "reset"].includes(mode) && <label>{mode === "reset" ? "Новый пароль" : "Пароль"}<input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} minLength={mode === "signin" ? 1 : 10} maxLength={128} required disabled={busy} />{mode !== "signin" && <small className="subtle-label">Не менее 10 символов</small>}</label>}
        {["signup", "reset"].includes(mode) && <label>Повтори пароль<input name="confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} minLength={10} maxLength={128} required disabled={busy} /></label>}
        <button type="submit" disabled={busy}><Icon name="arrow" />{busy ? "Подожди…" : labels[mode]}</button>
      </form> : <button onClick={() => setRetry(value => value + 1)}>Повторить подключение</button>}
      {["verify", "reset"].includes(mode) && <div className="auth-links">
        <button type="button" className="text-button" disabled={busy || resendSeconds > 0} onClick={resendCode}>{resendSeconds > 0 ? `Отправить код повторно через ${resendSeconds} с` : "Отправить код повторно"}</button>
        <button type="button" className="text-button" disabled={busy} onClick={() => changeMode(mode === "reset" ? "forgot" : "signin")}>Изменить почту</button>
      </div>}
      <div className="auth-links">{mode === "signin" ? <><button className="text-button" disabled={busy} onClick={() => changeMode("signup")}>Создать аккаунт</button><button className="text-button" disabled={busy} onClick={() => changeMode("forgot")}>Забыли пароль?</button></> : <button className="text-button" disabled={busy} onClick={() => changeMode("signin")}>У меня уже есть аккаунт</button>}</div>
    </>}
    <p className="hosting-demo-note">Задания и результаты доступны только в твоём аккаунте.</p>
    <button className="text-button" disabled={busy} onClick={() => setShowAuth(false)}>На главную</button>
  </section></main>;
}
