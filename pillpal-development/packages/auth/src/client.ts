declare const process: { env?: Record<string, string | undefined> } | undefined;

const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;

const TOKEN_STORAGE_KEY = "pillpal_better_auth_token";
let memoryToken: string | null = null;

export function getAuthApiUrl(): string {
  const expoApiUrl =
    typeof process !== "undefined" && process.env
      ? process.env.EXPO_PUBLIC_API_URL
      : undefined;

  const base =
    metaEnv?.VITE_API_URL ||
    expoApiUrl ||
    proc?.env?.VITE_API_URL ||
    proc?.env?.EXPO_PUBLIC_API_URL ||
    proc?.env?.BETTER_AUTH_URL ||
    "http://localhost:4000";

  return base.replace(/\/+$/, "");
}

export function getStoredAuthToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    const stored = globalThis.localStorage?.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      memoryToken = stored;
      return stored;
    }
  } catch {
    // React Native native runtime has no localStorage; token is hydrated via setStoredAuthToken
  }
  return null;
}

export function setStoredAuthToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) {
      globalThis.localStorage?.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      globalThis.localStorage?.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore on native runtimes without localStorage
  }
}

export function clearStoredAuthToken(): void {
  setStoredAuthToken(null);
}
