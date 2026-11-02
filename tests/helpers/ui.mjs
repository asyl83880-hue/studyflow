import assert from "node:assert/strict";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

export async function withUI(component, props, fixture, run) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://studyflow.example.test/", pretendToBeVisual: true });
  const originalFetch = globalThis.fetch;
  const originals = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  globalThis.fetch = fixture.fetch;
  const server = await createServer({ cacheDir: resolve("node_modules/.vite-workspace-tests"), server: { middlewareMode: true, hmr: false, ws: false } });
  const { default: React, act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { default: Component } = await server.ssrLoadModule(component);
  const api = await server.ssrLoadModule("/src/api.js");
  api.setIdentity("qa-learner");
  fixture.seed?.(api);
  const root = createRoot(document.getElementById("root"));
  const visible = node => !node.closest("[hidden]");
  const button = (label, scope = document) => [...scope.querySelectorAll("button")].find(node => visible(node) && node.textContent.trim() === label);
  async function click(label, scope) {
    const node = button(label, scope);
    assert.ok(node, `missing visible button: ${label}`);
    assert.equal(node.disabled, false, `disabled button: ${label}`);
    await act(async () => node.click());
  }
  async function fill(selector, value) {
    const input = document.querySelector(selector);
    assert.ok(input, `missing field: ${selector}`);
    const prototype = input.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype
      : input.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value);
      input.dispatchEvent(new dom.window.Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });
  }
  async function submit(selector) {
    const form = document.querySelector(selector);
    assert.ok(form, `missing form: ${selector}`);
    await act(async () => form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  }
  try {
    await act(async () => root.render(React.createElement(Component, props)));
    await run({ act, click, fill, submit, button, api, dom });
  } finally {
    await act(async () => root.unmount());
    await server.close(); dom.window.close(); globalThis.fetch = originalFetch;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}
