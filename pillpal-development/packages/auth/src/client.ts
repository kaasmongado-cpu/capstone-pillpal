import { createClient } from "@supabase/supabase-js";

declare const process: { env?: Record<string, string | undefined> } | undefined;

const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;

const expoSupabaseUrl =
  typeof process !== "undefined" && process.env ? process.env.EXPO_PUBLIC_SUPABASE_URL : undefined;
const expoSupabaseKey =
  (typeof process !== "undefined" && process.env ? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY : undefined) ||
  (typeof process !== "undefined" && process.env ? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY : undefined);

const supabaseUrl =
  metaEnv?.VITE_SUPABASE_URL ||
  expoSupabaseUrl ||
  proc?.env?.VITE_SUPABASE_URL ||
  proc?.env?.EXPO_PUBLIC_SUPABASE_URL ||
  proc?.env?.SUPABASE_URL ||
  "";

const supabasePublishableKey =
  metaEnv?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  expoSupabaseKey ||
  proc?.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  proc?.env?.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  proc?.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  proc?.env?.SUPABASE_ANON_KEY ||
  proc?.env?.SUPABASE_SERVICE_ROLE_KEY ||
  "";

if (!supabaseUrl) {
  throw new Error("Missing VITE_SUPABASE_URL");
}

if (!supabasePublishableKey) {
  throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY");
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
);