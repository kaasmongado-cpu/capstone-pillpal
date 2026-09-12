import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { prisma } from "@pillpal/database";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../../.env"),
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

export type ProviderRole =
  | "DOCTOR"
  | "HEALTH_STAFF";

export type CreateProviderInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  workId: string;
  specialization?: string;
  role: ProviderRole;
};

export async function createProvider(
  input: CreateProviderInput,
) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim() || null;
  const workId = input.workId.trim();
  const specialization =
    input.specialization?.trim() || null;
  const role = input.role;

  if (
    !firstName ||
    !lastName ||
    !email ||
    !workId ||
    !role
  ) {
    throw new Error(
      "First name, last name, email, work ID, and provider role are required.",
    );
  }

  if (
    role !== "DOCTOR" &&
    role !== "HEALTH_STAFF"
  ) {
    throw new Error(
      "Provider role must be DOCTOR or HEALTH_STAFF.",
    );
  }

  if (
    role === "DOCTOR" &&
    !specialization
  ) {
    throw new Error(
      "Specialization is required for doctors.",
    );
  }

  const existingEmail = await prisma.user.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
    },
  });

  if (existingEmail) {
    throw new Error(
      "A PILLPAL account with this email already exists.",
    );
  }

  const existingWorkId = await prisma.user.findFirst({
    where: {
      workId,
    },
    select: {
      id: true,
    },
  });

  if (existingWorkId) {
    throw new Error(
      "A provider with this Work ID already exists.",
    );
  }

  const { data, error } =
    await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          firstName,
          lastName,
          role,
          userType: "HEALTHCARE_PROVIDER",
        },
      },
    );

  if (error || !data.user) {
    throw new Error(
      error?.message ??
        "Unable to send the provider invitation.",
    );
  }

  const supabaseUser = data.user;

  try {
    const provider = await prisma.user.create({
      data: {
        supabaseUserId: supabaseUser.id,
        email,
        firstName,
        lastName,
        phone,
        workId,
        specialization:
          role === "DOCTOR"
            ? specialization
            : null,
        role,
        userType: "HEALTHCARE_PROVIDER",
        status: "ACTIVE",
      },
    });

    return provider;
  } catch (databaseError) {
    await supabase.auth.admin.deleteUser(
      supabaseUser.id,
    );

    throw databaseError;
  }
}