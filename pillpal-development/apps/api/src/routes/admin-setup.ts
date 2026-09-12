import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { prisma } from "@pillpal/database";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load apps/api/.env
dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL");
}

if (!supabaseServiceRoleKey) {
  throw new Error(
    "Missing SUPABASE_SERVICE_ROLE_KEY",
  );
}

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
);

type AdminSetupBody = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

async function readRequestBody(
  req: IncomingMessage,
): Promise<AdminSetupBody> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const body = JSON.parse(
    Buffer.concat(chunks).toString("utf-8"),
  ) as AdminSetupBody;

  return body;
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: unknown,
): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
  });

  res.end(JSON.stringify(data));
}

export async function adminSetupRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const existingAdmin = await prisma.user.findFirst({
      where: {
        role: "ADMIN",
      },
      select: {
        id: true,
      },
    });

    if (existingAdmin) {
      sendJson(res, 403, {
        message:
          "Admin setup has already been completed.",
      });

      return;
    }

    const body = await readRequestBody(req);

    const email = body.email?.trim();
    const password = body.password;
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();

    if (
      !email ||
      !password ||
      !firstName ||
      !lastName
    ) {
      sendJson(res, 400, {
        message:
          "Email, password, first name, and last name are required.",
      });

      return;
    }

    if (password.length < 8) {
      sendJson(res, 400, {
        message:
          "Password must be at least 8 characters.",
      });

      return;
    }

    const { data, error } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          firstName,
          lastName,
          role: "ADMIN",
        },
      });

    if (error || !data.user) {
      sendJson(res, 400, {
        message:
          error?.message ??
          "Unable to create the admin account.",
      });

      return;
    }

    const supabaseUser = data.user;

    try {
      const admin = await prisma.user.create({
        data: {
          supabaseUserId: supabaseUser.id,
          email,
          firstName,
          lastName,
          role: "ADMIN",
          userType: "HEALTHCARE_PROVIDER",
        },
      });

      sendJson(res, 201, {
        message:
          "Admin account created successfully.",
        user: {
          id: admin.id,
          email: admin.email,
          firstName: admin.firstName,
          lastName: admin.lastName,
          role: admin.role,
          userType: admin.userType,
        },
      });
    } catch (databaseError) {
      // Remove the Supabase account if the
      // corresponding PILLPAL user cannot be created.
      await supabase.auth.admin.deleteUser(
        supabaseUser.id,
      );

      throw databaseError;
    }
  } catch (error) {
    console.error(
      "Admin setup failed:",
      error,
    );

    sendJson(res, 500, {
      message:
        "Unable to complete admin setup.",
    });
  }
}