import crypto from "node:crypto";
import { prisma } from "@pillpal/database";
import { sendProviderInviteEmail } from "../email.js";

export type ProviderRole = "DOCTOR" | "HEALTH_STAFF";

export type CreateProviderInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  workId: string;
  specialization?: string;
  role: ProviderRole;
};

export async function createProvider(input: CreateProviderInput) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim() || null;
  const workId = input.workId.trim();
  const specialization = input.specialization?.trim() || null;
  const role = input.role;

  if (!firstName || !lastName || !email || !workId || !role) {
    throw new Error(
      "First name, last name, email, work ID, and provider role are required.",
    );
  }

  if (role !== "DOCTOR" && role !== "HEALTH_STAFF") {
    throw new Error("Provider role must be DOCTOR or HEALTH_STAFF.");
  }

  if (role === "DOCTOR" && !specialization) {
    throw new Error("Specialization is required for doctors.");
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingEmail) {
    throw new Error("A PILLPAL account with this email already exists.");
  }

  const existingWorkId = await prisma.user.findFirst({
    where: { workId },
    select: { id: true },
  });

  if (existingWorkId) {
    throw new Error("A provider with this Work ID already exists.");
  }

  const healthcareWebUrl =
    process.env.HEALTHCARE_WEB_URL || "http://localhost:5174";
  const inviteToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  const provider = await prisma.user.create({
    data: {
      name: `${firstName} ${lastName}`.trim(),
      email,
      emailVerified: false,
      firstName,
      lastName,
      phone,
      workId,
      specialization: role === "DOCTOR" ? specialization : null,
      role,
      userType: "HEALTHCARE_PROVIDER",
      status: "ACTIVE",
    },
  });

  await prisma.verification.create({
    data: {
      identifier: `provider-invite:${inviteToken}`,
      value: provider.id,
      expiresAt,
    },
  });

  const inviteUrl = `${healthcareWebUrl}/set-password?token=${encodeURIComponent(inviteToken)}`;

  await sendProviderInviteEmail({
    to: email,
    firstName,
    role,
    inviteUrl,
  });

  return provider;
}
