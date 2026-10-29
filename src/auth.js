import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/auth/vanilla/adapters";
import { setTokenProvider } from "./api.js";

let client;
let configuredUrl;
let cachedToken;
let tokenRequest;
let revision = 0;

export function clearAuthToken() {
  revision += 1;
  cachedToken = null;
  tokenRequest = null;
}

export function configureAuth(url) {
  if (configuredUrl !== url) {
    client = createAuthClient(url, { adapter: BetterAuthVanillaAdapter({ fetchOptions: { timeout: 10_000, retry: 0 } }) });
    configuredUrl = url;
    clearAuthToken();
  }
  setTokenProvider(async () => {
    if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
    if (!tokenRequest) {
      const version = revision;
      tokenRequest = client.token().then(({ data, error }) => {
        // Neon 0.6 can serve /token from its session cache after getSession().
        // The SDK puts the JWT from set-auth-jwt in that session's token field.
        const token = data?.token || data?.session?.token;
        if (error || typeof token !== "string" || token.split(".").length !== 3) {
          throw new Error("Войди в свой аккаунт ещё раз.");
        }
        let expires = Date.now() + 30_000;
        try {
          const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
          if (Number.isFinite(payload.exp)) expires = payload.exp * 1000;
        } catch { /* The server still validates the signature and expiry. */ }
        if (version !== revision) throw new Error("Аккаунт изменился. Повтори действие.");
        cachedToken = { value: token, expires };
        return token;
      }).finally(() => { if (version === revision) tokenRequest = null; });
    }
    return tokenRequest;
  });
  return client;
}
