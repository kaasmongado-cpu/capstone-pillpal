import { createClient } from "@supabase/supabase-js";

const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;

const supabaseUrl =
  metaEnv?.VITE_SUPABASE_URL ||
  proc?.env?.VITE_SUPABASE_URL ||
  proc?.env?.SUPABASE_URL ||
  "";

const supabasePublishableKey =
  metaEnv?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  proc?.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
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