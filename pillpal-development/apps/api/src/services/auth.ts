import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { prisma } from "@pillpal/database";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

const supabaseUrl = process.env.SUPABASE_URL;

const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL");
}

if (!supabasePublishableKey) {
  throw new Error("Missing SUPABASE_PUBLISHABLE_KEY");
}

const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
);

export async function getAuthenticatedUser(
  accessToken: string,
) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return null;
  }

  const pillpalUser = await prisma.user.findUnique({
    where: {
      supabaseUserId: user.id,
    },
  });

  return pillpalUser;
}