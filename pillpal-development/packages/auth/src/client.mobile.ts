import { createClient } from "@supabase/supabase-js";

declare const process: { env: Record<string, string | undefined> };

const supabaseUrl =
  (typeof process !== "undefined" && process.env && process.env.EXPO_PUBLIC_SUPABASE_URL) ||
  "";

const supabasePublishableKey =
  (typeof process !== "undefined" && process.env && process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
  (typeof process !== "undefined" && process.env && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ||
  "";

if (!supabaseUrl) {
  throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL");
}

if (!supabasePublishableKey) {
  throw new Error("Missing EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

