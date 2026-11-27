import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { prisma } from "@pillpal/database";
import { getAuthenticatedUser } from "../services/auth.js";

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

function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseOptionalDob(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = new Date(raw.trim());
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  if (parsed > now) return null;
  return parsed;
}

function formatMeResponse(
  user: any,
  accounts: Array<{ providerId: string; password: string | null }> = [],
) {
  const hasPassword = accounts.some(
    (a) => a.providerId === "credential" && Boolean(a.password),
  );
  const authProviders = Array.from(new Set(accounts.map((a) => a.providerId)));

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone || null,
    workId: user.workId || null,
    specialization: user.specialization || null,
    role: user.role,
    userType: user.userType,
    status: user.status,
    emailVerified: Boolean(user.emailVerified),
    hasPassword,
    authProviders,
    patientProfile: user.patientProfile || null,
  };
}

export async function meRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    sendJson(res, 401, { message: "Authentication required" });
    return;
  }

  const accessToken = authorization.slice(7);
  const user = await getAuthenticatedUser(accessToken);

  if (!user) {
    sendJson(res, 401, { message: "Invalid authentication" });
    return;
  }

  if (req.method === "GET") {
    const accounts = await prisma.account.findMany({
      where: { userId: user.id },
      select: { providerId: true, password: true },
    });
    sendJson(res, 200, formatMeResponse(user, accounts));
    return;
  }

  if (req.method === "PATCH") {
    try {
      const body = await readJsonBody(req);
      const isClinician =
        user.role === "DOCTOR" || user.role === "HEALTH_STAFF" || user.role === "ADMIN";

      const firstName =
        isClinician && typeof body.firstName === "string"
          ? body.firstName.trim()
          : undefined;
      const lastName =
        isClinician && typeof body.lastName === "string"
          ? body.lastName.trim()
          : undefined;
      const specialization =
        isClinician && typeof body.specialization === "string"
          ? body.specialization.trim() || null
          : undefined;

      const phone =
        typeof body.phone === "string"
          ? body.phone.trim() || null
          : undefined;
      const gender =
        typeof body.gender === "string"
          ? body.gender.trim() || null
          : undefined;
      const bloodType =
        typeof body.bloodType === "string"
          ? body.bloodType.trim() || null
          : undefined;
      const allergies =
        typeof body.allergies === "string"
          ? body.allergies.trim() || null
          : undefined;
      const medicalConditions =
        typeof body.medicalConditions === "string"
          ? body.medicalConditions.trim() || null
          : undefined;
      const emergencyContactName =
        typeof body.emergencyContactName === "string"
          ? body.emergencyContactName.trim() || null
          : undefined;
      const emergencyContactPhone =
        typeof body.emergencyContactPhone === "string"
          ? body.emergencyContactPhone.trim() || null
          : undefined;
      const dateOfBirth =
        body.dateOfBirth !== undefined
          ? parseOptionalDob(body.dateOfBirth)
          : undefined;

      if (firstName !== undefined && !firstName) {
        sendJson(res, 400, { message: "First name cannot be empty." });
        return;
      }

      if (lastName !== undefined && !lastName) {
        sendJson(res, 400, { message: "Last name cannot be empty." });
        return;
      }

      if (phone) {
        if (isClinician) {
          // Allow PH mobile, clinic landlines, or extensions (e.g. (085) 341-2786, +63 917 555 1234, ext. 104)
          const validClinicPhone = /^[+\d()\s.-]{6,24}$/.test(phone);
          if (!validClinicPhone) {
            sendJson(res, 400, {
              message: "Please enter a valid phone number or clinic extension.",
            });
            return;
          }
        } else if (!/^(\+?63|0)9\d{9}$/.test(phone.replace(/[\s()-]/g, ""))) {
          sendJson(res, 400, {
            message:
              "Please enter a valid Philippine mobile number (e.g. 0912 345 6789 or +63 912 345 6789).",
          });
          return;
        }
      }

      const nextFirstName = firstName ?? user.firstName;
      const nextLastName = lastName ?? user.lastName;
      const existingProfile = (user as any).patientProfile;

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(firstName !== undefined ? { firstName: nextFirstName } : {}),
          ...(lastName !== undefined ? { lastName: nextLastName } : {}),
          ...(firstName !== undefined || lastName !== undefined
            ? { name: `${nextFirstName} ${nextLastName}`.trim() }
            : {}),
          ...(specialization !== undefined ? { specialization } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(existingProfile
            ? {
                patientProfile: {
                  update: {
                    ...(dateOfBirth !== undefined ? { dateOfBirth } : {}),
                    ...(gender !== undefined ? { gender } : {}),
                    ...(bloodType !== undefined ? { bloodType } : {}),
                    ...(allergies !== undefined ? { allergies } : {}),
                    ...(medicalConditions !== undefined ? { medicalConditions } : {}),
                    ...(emergencyContactName !== undefined ? { emergencyContactName } : {}),
                    ...(emergencyContactPhone !== undefined ? { emergencyContactPhone } : {}),
                  },
                },
              }
            : {}),
        },
        include: { patientProfile: true },
      });

      const accounts = await prisma.account.findMany({
        where: { userId: updatedUser.id },
        select: { providerId: true, password: true },
      });

      sendJson(res, 200, formatMeResponse(updatedUser, accounts));
      return;
    } catch (err: any) {
      console.error("PATCH /me/profile error:", err);
      sendJson(res, 500, { message: err?.message || "Failed to update profile." });
      return;
    }
  }

  sendJson(res, 405, { message: "Method not allowed" });
}
