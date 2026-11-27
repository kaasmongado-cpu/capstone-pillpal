import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";

import { prisma } from "@pillpal/database";
import { auth } from "../lib/auth.js";
import { logActivity } from "../services/activity-log.js";
import { createNotification } from "../services/notifications.js";

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

  return JSON.parse(
    Buffer.concat(chunks).toString("utf-8"),
  ) as AdminSetupBody;
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
        message: "Admin setup has already been completed.",
      });
      return;
    }

    const body = await readRequestBody(req);

    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();

    if (!email || !password || !firstName || !lastName) {
      sendJson(res, 400, {
        message: "Email, password, first name, and last name are required.",
      });
      return;
    }

    if (password.length < 8) {
      sendJson(res, 400, {
        message: "Password must be at least 8 characters.",
      });
      return;
    }

    const ctx = await auth.$context;
    const hashedPassword = await ctx.password.hash(password);

    const admin = await prisma.user.create({
      data: {
        name: `${firstName} ${lastName}`.trim(),
        email,
        emailVerified: true,
        firstName,
        lastName,
        role: "ADMIN",
        userType: "HEALTHCARE_PROVIDER",
        status: "ACTIVE",
      },
    });

    await prisma.account.create({
      data: {
        accountId: admin.id,
        providerId: "credential",
        userId: admin.id,
        password: hashedPassword,
      },
    });

    await logActivity({
      adminId: admin.id,
      action: "ADMIN_SETUP_COMPLETED",
      details: `Initial administrator account created for ${admin.firstName} ${admin.lastName} (${admin.email}).`,
      targetId: admin.id,
      targetType: "USER",
    });

    await createNotification({
      userId: admin.id,
      type: "SUCCESS",
      title: "Welcome to PILLPAL Management",
      message: "Administrator account setup was completed successfully.",
    });

    sendJson(res, 201, {
      message: "Admin account created successfully.",
      user: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
        userType: admin.userType,
      },
    });
  } catch (error) {
    console.error("Admin setup failed:", error);
    sendJson(res, 500, {
      message: "Unable to complete admin setup.",
    });
  }
}
