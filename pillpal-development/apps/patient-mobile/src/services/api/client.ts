import { getAuthToken } from "../auth/session";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";

/**
 * Standard fetch wrapper that automatically injects the Supabase JWT token
 */
export async function fetchWithAuth(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  return fetch(url, {
    ...options,
    headers,
  });
}

