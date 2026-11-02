import test from "node:test";
import assert from "node:assert/strict";
import { withUI } from "./helpers/ui.mjs";

const deadline = new Date();
deadline.setDate(deadline.getDate() + 3);
deadline.setHours(18, 0, 0, 0);
const taskDay = `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, "0")}-${String(deadline.getDate()).padStart(2, "0")}`;
const task = { id: 1, subject: "Алгебра", topic: "Линейные уравнения", description: "Упражнения 1–5", deadline: deadline.toISOString(), difficulty: "medium", estimated_time: 30, completed: false };
const user = { id: "qa-learner", name: "Тестовый ученик", email: "learner@example.test" };
const emptyPlan = { planned_minutes: 0, unplanned_minutes: 0, pending_tasks: 0, daily_limit: 120, days: [], warnings: [], suggestions: [] };

function taskAPI(initial = [task]) {
  let tasks = initial.map(value => ({ ...value }));
  const calls = [];
  let deletionFails = false;
  return {
    calls,
    failDeletion: value => { deletionFails = value; },
    fetch: async (url, options = {}) => {
      const path = new URL(url).pathname, method = options.method || "GET";
      const data = options.body && typeof options.body === "string" ? JSON.parse(options.body) : null;
      calls.push({ path, method, data });
      assert.ok(!path.includes("/ai/") && !path.includes("/tutor/") && !path.includes("/mini-tests"), "workspace QA must not call AI");
      if (path === "/tasks" && method === "GET") return Response.json(tasks);
      if (path === "/tasks/estimate") return Response.json({ difficulty: "medium", estimated_time: 30, reasons: [], warnings: [] });
      if (path === "/tasks" && method === "POST") {
        const created = { ...data, id: 2, completed: false };
        tasks.push(created); return Response.json(created, { status: 201 });
      }
      if (path === "/tasks/1/complete" && method === "PATCH") {
        tasks[0] = { ...tasks[0], completed: true }; return Response.json(tasks[0]);
      }
      if (path === "/tasks/1" && method === "PUT") {
        tasks[0] = { ...tasks[0], ...data }; return Response.json(tasks[0]);
      }
      if (path === "/tasks/1" && method === "DELETE") {
        if (deletionFails) return Response.json({ detail: "Не удалось сохранить удаление. Повтори попытку." }, { status: 503 });
        tasks = []; return Response.json({ message: "Задание удалено" });
      }
      throw new Error(`Unexpected workspace request: ${method} ${path}`);
    },
  };
}

test("the photo form discloses Cloudflare before an image is uploaded", async () => {
  await withUI("/src/App.jsx", { user, aiProvider: "cloudflare" }, taskAPI([]), async ({ click }) => {
    await click("Новое задание");
    await click("По фото");
    assert.match(document.body.textContent, /Cloudflare Workers AI/);
    assert.doesNotMatch(document.body.textContent, /OpenAI/);
  });
});

test("a new task opens the manual form and can be saved without AI", async () => {
  const fixture = taskAPI([]);
  await withUI("/src/App.jsx", { user }, fixture, async ({ click, fill, submit, button, act }) => {
    await click("Новое задание");
    assert.equal(button("Вручную").getAttribute("aria-pressed"), "true");
    await fill('input[name="subject"]', "Физика");
    await fill('input[name="topic"]', "Законы Ньютона");
    await fill('input[name="deadline"]', "2026-11-06T18:00");
    await act(async () => new Promise(resolve => setTimeout(resolve, 400)));
    await submit('form[aria-label="Новое задание"]');
    assert.equal(fixture.calls.filter(call => call.method === "POST" && call.path === "/tasks").length, 1);
    await click("Мои задания");
    assert.match(document.querySelector(".assignments-panel").textContent, /Законы Ньютона/);
  });
});

test("completed tasks can return to work and the calendar reflects the updated state", async () => {
  const fixture = taskAPI();
  await withUI("/src/App.jsx", { user }, fixture, async ({ click, api }) => {
    await click("Мои задания");
    await click("Выполнено");
    await click("Вернуть в работу");
    assert.deepEqual(fixture.calls.find(call => call.method === "PUT").data, { completed: false });
    assert.match(document.querySelector(".assignments-panel").textContent, /Нужно сделать/);
    await click("Календарь");
    const day = document.querySelector(`[data-day="${taskDay}"]`);
    assert.ok(day, "calendar must include the task's deadline date");
    await click(day.textContent.trim());
    assert.match(document.querySelector(".selected-day-panel").textContent, /Линейные уравнения/);
    assert.match(document.querySelector(".selected-day-panel").textContent, /Нужно сделать/);
  });
});

test("deletion requires confirmation, preserves a failed attempt, and allows retry", async () => {
  const fixture = taskAPI();
  await withUI("/src/App.jsx", { user }, fixture, async ({ click }) => {
    await click("Мои задания");
    await click("Удалить");
    assert.equal(fixture.calls.filter(call => call.method === "DELETE").length, 0);
    const dialog = document.querySelector('[role="dialog"][aria-labelledby="delete-task-title"]');
    assert.ok(dialog && !dialog.closest("[hidden]"));
    assert.match(dialog.textContent, /Линейные уравнения/);
    await click("Отмена", dialog);
    assert.equal(fixture.calls.filter(call => call.method === "DELETE").length, 0);
    await click("Удалить");
    fixture.failDeletion(true);
    await click("Удалить задание", dialog);
    assert.match(dialog.textContent, /Повтори попытку/);
    assert.match(document.querySelector(".assignments-panel").textContent, /Линейные уравнения/);
    fixture.failDeletion(false);
    await click("Удалить задание", dialog);
    assert.equal(fixture.calls.filter(call => call.method === "DELETE").length, 2);
    assert.doesNotMatch(document.querySelector(".assignments-panel").textContent, /Линейные уравнения/);
  });
});

test("changing the plan period preserves future commitments and removes past ones", async () => {
  const calls = [];
  const fixture = {
    seed: api => localStorage.setItem(api.userStorageKey("studyflow.planner.v1"), JSON.stringify({ daily_limit: 120, horizon_days: 30, busy_minutes: { "2026-10-25": 90, "2026-11-28": 60 } })),
    fetch: async (url, options) => {
      assert.ok(String(url).endsWith("/planner/preview"));
      calls.push(JSON.parse(options.body)); return Response.json(emptyPlan);
    },
  };
  await withUI("/src/components/SmartPlanner.jsx", { tasks: [], now: new Date("2026-11-02T10:00:00Z"), taskActions: {} }, fixture, async ({ fill, submit, api }) => {
    await fill("#planner-horizon", "7");
    await submit('form[aria-label="Настройки плана"]');
    const saved = JSON.parse(localStorage.getItem(api.userStorageKey("studyflow.planner.v1")));
    assert.equal(saved.busy_minutes["2026-11-28"], 60);
    assert.equal(saved.busy_minutes["2026-10-25"], undefined);
    assert.equal(calls.at(-1).busy_minutes["2026-11-28"], 60);
    await fill("#planner-horizon", "30");
    assert.equal(document.querySelector('[id="busy-2026-11-28"]').value, "60");
  });
});
