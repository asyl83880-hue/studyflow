import test from "node:test";
import assert from "node:assert/strict";
import { configureAuth, clearAuthToken } from "../src/auth.js";
import { getCurrentIdentity } from "../src/api.js";

const expires = Math.floor(Date.now() / 1000) + 900;
const jwt = [
  Buffer.from(JSON.stringify({ alg: "EdDSA" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: "learner-a", exp: expires })).toString("base64url"),
  "test-signature",
].join(".");
const session = {
  session: { id: "session-a", userId: "learner-a", token: "opaque-session-cookie", expiresAt: new Date(expires * 1000).toISOString() },
  user: { id: "learner-a", name: "Test learner", email: "learner@example.test", emailVerified: false },
};

async function withProvider(callback, { jwtHeader = true } = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(options.headers) });
    const headers = { "Content-Type": "application/json" };
    if (url.endsWith("/get-session")) {
      if (jwtHeader) headers["set-auth-jwt"] = jwt;
      return new Response(JSON.stringify(session), { headers });
    }
    if (url.endsWith("/token")) return Response.json({ token: jwt });
    if (url.endsWith("/sign-out")) return Response.json({ success: true });
    if (url.endsWith("/auth/me")) return Response.json({ id: "learner-a" });
    throw new Error("Unexpected test request");
  };
  const client = configureAuth("https://auth.example.test/studyflow/auth");
  try {
    await client.signOut();
    clearAuthToken();
    await callback(client, calls);
  } finally {
    await client.signOut();
    clearAuthToken();
    globalThis.fetch = originalFetch;
  }
}

test("protected API uses the SDK's cached session JWT after checking the login session", async () => {
  await withProvider(async (client, calls) => {
    const checked = await client.getSession();
    assert.equal(checked.data.session.token, jwt);
    const identity = await getCurrentIdentity();
    assert.deepEqual(identity, { id: "learner-a" });
    assert.equal(calls.find(call => call.url.endsWith("/auth/me")).headers.get("Authorization"), `Bearer ${jwt}`);
  });
});

test("protected API also accepts a fresh JWT endpoint response", async () => {
  await withProvider(async (_client, calls) => {
    assert.deepEqual(await getCurrentIdentity(), { id: "learner-a" });
    assert.equal(calls.find(call => call.url.endsWith("/auth/me")).headers.get("Authorization"), `Bearer ${jwt}`);
  });
});

test("an opaque session cookie is never forwarded as a Bearer JWT", async () => {
  await withProvider(async (client, calls) => {
    await client.getSession();
    await assert.rejects(getCurrentIdentity(), /Войди в свой аккаунт/);
    assert.equal(calls.filter(call => call.url.endsWith("/auth/me")).length, 0);
  }, { jwtHeader: false });
});
