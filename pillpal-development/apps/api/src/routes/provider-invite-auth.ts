import type { IncomingMessage, ServerResponse } from "node:http";
import { prisma } from "@pillpal/database";
import { auth } from "../lib/auth.js";

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export async function providerInviteAuthRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url || "/", "http://localhost:4000");
  const pathname = url.pathname;

  // 1. GET /auth/provider/verify-invite?token=...
  if (req.method === "GET" && pathname === "/auth/provider/verify-invite") {
    try {
      const token = url.searchParams.get("token")?.trim();
      if (!token) {
        sendJson(res, 400, { valid: false, message: "Invitation token is required." });
        return;
      }

      const record = await prisma.verification.findFirst({
        where: { identifier: `provider-invite:${token}` },
      });

      if (!record || record.expiresAt < new Date()) {
        sendJson(res, 400, {
          valid: false,
          message:
            "This invitation link has expired or has already been used. Please ask clinic administration to resend your invitation.",
        });
        return;
      }

      const provider = await prisma.user.findUnique({
        where: { id: record.value },
        select: { id: true, email: true, firstName: true, lastName: true, role: true },
      });

      if (!provider) {
        sendJson(res, 404, { valid: false, message: "Invited provider account no longer exists." });
        return;
      }

      sendJson(res, 200, {
        valid: true,
        provider,
      });
      return;
    } catch (err: any) {
      console.error("GET /auth/provider/verify-invite error:", err);
      sendJson(res, 500, { valid: false, message: "Unable to verify invitation token." });
      return;
    }
  }

  // 2. POST /auth/provider/complete-invite { token, password }
  if (req.method === "POST" && pathname === "/auth/provider/complete-invite") {
    try {
      const body = await readJsonBody(req);
      const token = typeof body.token === "string" ? body.token.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";

      if (!token) {
        sendJson(res, 400, { message: "Invitation token is required." });
        return;
      }

      if (password.length < 8) {
        sendJson(res, 400, { message: "Password must be at least 8 characters long." });
        return;
      }

      const record = await prisma.verification.findFirst({
        where: { identifier: `provider-invite:${token}` },
      });

      if (!record || record.expiresAt < new Date()) {
        sendJson(res, 400, {
          message: "This invitation link has expired or has already been used.",
        });
        return;
      }

      const provider = await prisma.user.findUnique({
        where: { id: record.value },
      });

      if (!provider) {
        sendJson(res, 404, { message: "Provider account not found." });
        return;
      }

      const ctx = await auth.$context;
      const hashedPassword = await ctx.password.hash(password);

      // Upsert credential account + mark emailVerified = true
      const existingAccount = await prisma.account.findFirst({
        where: { userId: provider.id, providerId: "credential" },
      });

      if (existingAccount) {
        await prisma.account.update({
          where: { id: existingAccount.id },
          data: { accountId: provider.id, password: hashedPassword },
        });
      } else {
        await prisma.account.create({
          data: {
            accountId: provider.id,
            providerId: "credential",
            userId: provider.id,
            password: hashedPassword,
          },
        });
      }

      await prisma.user.update({
        where: { id: provider.id },
        data: { emailVerified: true },
      });

      // Consume the invite token
      await prisma.verification.delete({ where: { id: record.id } });

      sendJson(res, 200, {
        message: "Password established successfully!",
        email: provider.email,
      });
      return;
    } catch (err: any) {
      console.error("POST /auth/provider/complete-invite error:", err);
      sendJson(res, 500, { message: err.message || "Unable to complete password setup." });
      return;
    }
  }

  sendJson(res, 404, { message: "Provider auth endpoint not found" });
}
