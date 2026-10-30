import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

// Exercise the actual React form without sending mail or changing a real password.
// The installed provider SDK and its routes are tested separately in auth.test.mjs.
async function withForm(run) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://studyflow.example.test/" });
  const originals = new Map();
  const globals = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const sends = [];
  let sessionChecks = 0;
  let afterSignIn = false;
  const client = {
    getSession: async () => {
      sessionChecks += 1;
      return afterSignIn ? { error: { code: "NETWORK_ERROR" } } : { data: null, error: null };
    },
    signIn: { email: async () => { afterSignIn = true; return { error: null }; } },
    emailOtp: {
      sendVerificationOtp: async body => { sends.push(body); return { error: null }; },
      resetPassword: async () => ({ error: { code: "INVALID_OTP" } }),
      verifyEmail: async () => ({ error: { code: "INVALID_OTP" } }),
    },
  };
  globalThis.__studyflowAuthFixture = client;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.ok(String(url).endsWith("/config"), "form QA must not make an external request");
    return Response.json({ auth_url: "https://auth.example.test/studyflow/auth" });
  };
  const intervals = new Map();
  let intervalId = 0;
  dom.window.setInterval = callback => { intervals.set(++intervalId, callback); return intervalId; };
  dom.window.clearInterval = id => intervals.delete(id);
  const server = await createServer({
    cacheDir: resolve("node_modules/.vite-auth-form-tests"),
    server: { middlewareMode: true, hmr: false },
    plugins: [{
      name: "isolated-auth-form-fixture", enforce: "pre",
      load(id) {
        if (id === resolve("src/auth.js")) return "export const configureAuth = () => globalThis.__studyflowAuthFixture; export const clearAuthToken = () => {};";
      },
    }],
  });
  const { default: React, act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { default: AuthGate } = await server.ssrLoadModule("/src/components/AuthGate.jsx");
  const root = createRoot(document.getElementById("root"));
  const button = text => [...document.querySelectorAll("button")].find(node => node.textContent.trim() === text);
  async function click(text) {
    assert.ok(button(text), `missing button: ${text}`);
    await act(async () => button(text).click());
  }
  async function fill(name, value) {
    const input = document.querySelector(`input[name="${name}"]`);
    assert.ok(input, `missing input: ${name}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  }
  async function submit() {
    await act(async () => document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  }
  try {
    await act(async () => root.render(React.createElement(AuthGate)));
    await click("Открыть StudyFlow");
    await run({ client, sends, click, fill, submit, button, act, intervals, getSessionChecks: () => sessionChecks });
  } finally {
    await act(async () => root.unmount());
    await server.close();
    dom.window.close();
    globalThis.fetch = originalFetch;
    delete globalThis.__studyflowAuthFixture;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test("recovery keeps an invalid-code attempt, resends after the cooldown, and allows fixing email", async t => {
  await withForm(async ({ sends, click, fill, submit, button, act, intervals }) => {
    let now = Date.now();
    t.mock.method(Date, "now", () => now);
    await click("Забыли пароль?");
    await fill("email", "recovery@example.test");
    await submit();
    assert.deepEqual(sends, [{ email: "recovery@example.test", type: "forget-password" }]);
    assert.ok(button("Отправить код повторно через 60 с").disabled);
    await fill("otp", "000000");
    await fill("password", "synthetic-test-password");
    await fill("confirmation", "synthetic-test-password");
    await submit();
    assert.match(document.querySelector('[role="alert"]').textContent, /Код неверный или истёк/);
    assert.equal(document.querySelector('input[name="password"]').value, "synthetic-test-password");
    assert.equal(document.querySelector('input[name="otp"]').value, "000000");
    now += 61_000;
    await act(async () => { for (const callback of intervals.values()) callback(); });
    await click("Отправить код повторно");
    assert.equal(sends.length, 2);
    assert.equal(sends[1].type, "forget-password");
    assert.equal(document.querySelector('input[name="otp"]').value, "");
    assert.equal(document.querySelector('input[name="password"]').value, "synthetic-test-password");
    assert.equal(document.querySelector('[role="alert"]'), null);
    await click("Изменить почту");
    assert.equal(document.querySelector('input[name="email"]').readOnly, false);
    assert.equal(document.querySelector('input[name="otp"]'), null);
  });
});

test("a session check failure after sign-in never sends a verification email", async () => {
  await withForm(async ({ sends, fill, submit, getSessionChecks }) => {
    await fill("email", "signin@example.test");
    await fill("password", "synthetic-test-password");
    await submit();
    assert.equal(getSessionChecks(), 2);
    assert.match(document.querySelector('[role="alert"]').textContent, /Не удалось проверить вход/);
    assert.equal(sends.length, 0);
  });
});

test("resending an email confirmation uses verification rather than password recovery", async t => {
  await withForm(async ({ client, sends, fill, submit, click, act, intervals }) => {
    let now = Date.now();
    t.mock.method(Date, "now", () => now);
    client.signIn.email = async () => ({ error: { code: "EMAIL_NOT_VERIFIED" } });
    await fill("email", "verification@example.test");
    await fill("password", "synthetic-test-password");
    await submit();
    assert.match(document.querySelector("h1").textContent, /Подтверди почту/);
    now += 61_000;
    await act(async () => { for (const callback of intervals.values()) callback(); });
    await click("Отправить код повторно");
    assert.deepEqual(sends, [
      { email: "verification@example.test", type: "email-verification" },
      { email: "verification@example.test", type: "email-verification" },
    ]);
  });
});
