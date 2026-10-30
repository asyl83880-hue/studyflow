const API_URL = (import.meta.env?.VITE_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
let tokenProvider = async () => "";
let identity = "anonymous";
export function setTokenProvider(provider) { tokenProvider = provider; }
export function setIdentity(id) { identity = id || "anonymous"; }
export function userStorageKey(key) { return `studyflow.user.${identity}:${key}`; }

// Срок ожидания охватывает fetch и чтение тела. Отмена компонента сохраняется.
async function request(path, { method = "GET", data, body, signal, headers = {}, timeout = 15_000, authenticated = true } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
  let abortTokenWait;
  try {
    const token = authenticated ? await Promise.race([
      tokenProvider(),
      new Promise((_, reject) => {
        abortTokenWait = () => reject(new DOMException("Aborted", "AbortError"));
        if (controller.signal.aborted) abortTokenWait();
        else controller.signal.addEventListener("abort", abortTokenWait, { once: true });
      }),
    ]) : "";
    const requestHeaders = { ...headers };
    if (token) requestHeaders.Authorization = `Bearer ${token}`;
    if (data !== undefined) requestHeaders["Content-Type"] = "application/json";
    const response = await fetch(`${API_URL}${path}`, {
      method, signal: controller.signal, credentials: "omit",
      headers: requestHeaders,
      body: data === undefined ? body : JSON.stringify(data),
    });
    const result = await response.json().catch((error) => {
      if (controller.signal.aborted) throw error;
      return null;
    });
    if (!response.ok) {
      if (response.status === 401 && authenticated && typeof window !== "undefined") {
        window.dispatchEvent(new Event("studyflow-session-expired"));
      }
      const message = typeof result?.detail?.message === "string" ? result.detail.message
        : typeof result?.detail === "string" ? result.detail
        : response.status === 422 ? "Проверь обязательные поля и допустимые значения."
          : "Не удалось получить ответ сервера. Повтори попытку.";
      const failure = new Error(message);
      failure.status = response.status;
      failure.code = typeof result?.detail?.code === "string" ? result.detail.code : null;
      throw failure;
    }
    if (result === null) throw new Error("Сервер вернул неполный ответ. Повтори запрос.");
    return result;
  } catch (error) {
    if (timedOut) throw new Error("Сервер не ответил вовремя. Повтори попытку — введённые данные сохранены.");
    throw error;
  } finally {
    clearTimeout(timer);
    if (abortTokenWait) controller.signal.removeEventListener("abort", abortTokenWait);
    signal?.removeEventListener("abort", cancel);
  }
}

export const getAppConfig = () => request("/config", { authenticated: false, timeout: 65_000 });
export const getCurrentIdentity = () => request("/auth/me");

export const estimateTask = (data, signal) => request("/tasks/estimate", { method: "POST", data, signal });
export const getStudyPlan = (data, signal) => request("/planner/preview", { method: "POST", data, signal });
export const getTasks = (signal) => request("/tasks", { signal });
export const createTask = (data, requestId) => request("/tasks", {
  method: "POST", data, headers: requestId ? { "Idempotency-Key": requestId } : {},
});
export const updateTask = (id, data) => request(`/tasks/${id}`, { method: "PUT", data });
export const deleteTask = (id) => request(`/tasks/${id}`, { method: "DELETE" });
export const completeTask = (id) => request(`/tasks/${id}/complete`, { method: "PATCH" });

export function recognizeTaskImage(file, signal) {
  const body = new FormData();
  body.append("file", file);
  return request("/ai/recognize", { method: "POST", body, signal, timeout: 65_000 });
}

export const getTutorLesson = (data, signal) => request("/tutor/message", { method: "POST", data, signal, timeout: 75_000 });
export const createMiniTest = (data, signal) => request("/mini-tests", { method: "POST", data, signal, timeout: 75_000 });
export const getMiniTest = (id, signal) => request(`/mini-tests/${id}`, { signal });
export const getTestHistory = (signal) => request("/mini-tests?limit=20", { signal });
export const submitMiniTest = (id, answers, signal) => request(`/mini-tests/${id}/submit`, {
  method: "POST", data: { answers }, signal,
});
export const getTestResult = (id, signal) => request(`/test-results/${id}`, { signal });
export const getKnowledgeMap = (signal) => request("/knowledge-map", { signal });
