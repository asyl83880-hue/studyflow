import test from "node:test";
import assert from "node:assert/strict";
import { getTasks, createTask, getTestHistory, recognizeTaskImage, checkDemoAccess, setAccessCode } from "../src/api.js";

async function compressTimeouts(operation) {
  const original = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => original(fn, Math.min(ms, 10), ...args);
  try { await operation(); } finally { globalThis.setTimeout = original; }
}

function hangingFetch(_url, { signal }) {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) reject(new DOMException("Aborted", "AbortError"));
    else signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}

test("Зависшая загрузка и история завершаются понятной ошибкой", async () => {
  const original = globalThis.fetch; globalThis.fetch = hangingFetch;
  try {
    await compressTimeouts(async () => {
      await assert.rejects(getTasks(), /не ответил вовремя/);
      await assert.rejects(getTestHistory(), /не ответил вовремя/);
    });
  } finally { globalThis.fetch = original; }
});

test("Отмена компонента передаётся запросу", async () => {
  const original = globalThis.fetch; globalThis.fetch = hangingFetch;
  try {
    const controller = new AbortController();
    const promise = getTasks(controller.signal); controller.abort();
    await assert.rejects(promise, { name: "AbortError" });
  } finally { globalThis.fetch = original; }
});

test("Создание сохраняет ключ повтора и безопасный текст серверной ошибки", async () => {
  const original = globalThis.fetch; const requests=[];
  globalThis.fetch = async (_url, options) => {
    requests.push(options);
    return new Response(JSON.stringify({ detail: "База временно занята. Повтори попытку." }), { status: 503 });
  };
  try {
    for (let index=0; index<2; index++) await assert.rejects(createTask({ subject:"Алгебра" }, "same-key"), /База временно занята/);
    assert.deepEqual(requests.map(item => item.headers["Idempotency-Key"]), ["same-key", "same-key"]);
  } finally { globalThis.fetch = original; }
});

test("Фото передаётся multipart без вручную установленной boundary", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.ok(options.body instanceof FormData);
    assert.equal(options.headers["Content-Type"], undefined);
    return new Response(JSON.stringify({ has_task:true }));
  };
  try { await recognizeTaskImage(new File(["sample"], "sample.png", { type:"image/png" })); }
  finally { globalThis.fetch = original; }
});

test("Код доступа передаётся заголовком, сохраняя заголовок защиты повтора", async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ status: "ok" }));
  };
  try {
    setAccessCode("test-only-code");
    await checkDemoAccess();
    await createTask({ subject: "Алгебра" }, "same-key");
    assert.ok(requests[0].url.endsWith("/access/check"));
    assert.equal(requests[0].options.headers["X-StudyFlow-Access-Code"], "test-only-code");
    assert.equal(requests[1].options.headers["Idempotency-Key"], "same-key");
    assert.equal(requests[1].options.headers["Content-Type"], "application/json");
    setAccessCode("");
    await getTasks();
    assert.equal(requests[2].options.headers["X-StudyFlow-Access-Code"], undefined);
  } finally { setAccessCode(""); globalThis.fetch = original; }
});
