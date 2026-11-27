import type { IncomingMessage, ServerResponse } from "node:http";
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
  if (parsed > new Date()) return null;
  return parsed;
}

function isValidCsuId(raw: string): boolean {
  return /^(\d{2,4}-\d{4,6}|\d{6,10})$/.test(raw.trim());
}

function isValidPhPhone(raw: string): boolean {
  const cleaned = raw.replace(/[\s()-]/g, "");
  return /^(\+?63|0)9\d{9}$/.test(cleaned);
}

function formatPatientRecord(p: any) {
  const logs = p.adherenceLogs || [];
  const taken = logs.filter((l: any) => l.status === "TAKEN").length;
  const rate = logs.length > 0 ? Math.round((taken / logs.length) * 100) : null;

  return {
    id: p.id,
    userId: p.userId,
    name: `${p.user.firstName} ${p.user.lastName}`.trim(),
    firstName: p.user.firstName,
    lastName: p.user.lastName,
    email: p.user.email,
    phone: p.user.phone || null,
    idNumber: p.idNumber,
    department: p.department,
    type: p.user.userType,
    dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString() : null,
    gender: p.gender || null,
    bloodType: p.bloodType || null,
    allergies: p.allergies || null,
    medicalConditions: p.medicalConditions || null,
    emergencyContactName: p.emergencyContactName || null,
    emergencyContactPhone: p.emergencyContactPhone || null,
    activeMedicationsCount: (p.prescriptions || []).length,
    prescriptions: p.prescriptions || [],
    adherenceRate: rate,
    totalLogs: logs.length,
    status: p.user.status,
  };
}

const PATIENT_INCLUDE = {
  user: {
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      userType: true,
      status: true,
    },
  },
  prescriptions: {
    where: { status: "ACTIVE" as const },
    select: { id: true, name: true, dosage: true },
  },
  adherenceLogs: {
    take: 20,
    orderBy: { createdAt: "desc" as const },
    select: { status: true },
  },
};

export async function patientsRoute(req: IncomingMessage, res: ServerResponse) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    sendJson(res, 401, { message: "Unauthorized" });
    return;
  }

  // Only healthcare providers or admins can access patient records
  if (user.role !== "DOCTOR" && user.role !== "HEALTH_STAFF" && user.role !== "ADMIN") {
    sendJson(res, 403, { message: "Forbidden: Clinician access required" });
    return;
  }

  const url = new URL(req.url || "/", "http://localhost:4000");
  const pathname = url.pathname;

  // 1. GET /patients (list or search)
  if (req.method === "GET" && pathname === "/patients") {
    const search = url.searchParams.get("q")?.toLowerCase().trim();
    const typeFilter = url.searchParams.get("type"); // STUDENT | EMPLOYEE

    const patients = await prisma.patientProfile.findMany({
      where: {
        AND: [
          typeFilter
            ? { user: { userType: typeFilter as "STUDENT" | "EMPLOYEE" } }
            : {},
          search
            ? {
                OR: [
                  { idNumber: { contains: search, mode: "insensitive" } },
                  { department: { contains: search, mode: "insensitive" } },
                  { user: { firstName: { contains: search, mode: "insensitive" } } },
                  { user: { lastName: { contains: search, mode: "insensitive" } } },
                  { user: { email: { contains: search, mode: "insensitive" } } },
                ],
              }
            : {},
        ],
      },
      include: PATIENT_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    sendJson(res, 200, patients.map(formatPatientRecord));
    return;
  }

  // 1b. GET /patients/:id (Full 4-Tab Clinical Patient Chart)
  const getSingleMatch = pathname.match(/^\/patients\/([^/]+)$/);
  if (req.method === "GET" && getSingleMatch) {
    try {
      const patientId = getSingleMatch[1]!;

      const [profile, dispensationsRaw] = await Promise.all([
        prisma.patientProfile.findUnique({
          where: { id: patientId },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                emailVerified: true,
                phone: true,
                userType: true,
                status: true,
                createdAt: true,
              },
            },
            prescriptions: {
              orderBy: { createdAt: "desc" },
              include: {
                doctor: {
                  select: { firstName: true, lastName: true, specialization: true },
                },
              },
            },
            appointments: {
              take: 25,
              orderBy: { scheduledAt: "desc" },
              include: {
                provider: {
                  select: { firstName: true, lastName: true, specialization: true },
                },
              },
            },
            adherenceLogs: {
              take: 40,
              orderBy: { scheduledTime: "desc" },
              include: {
                prescription: {
                  select: { name: true, dosage: true },
                },
              },
            },
          },
        }),
        prisma.inventoryTransaction.findMany({
          where: { patientId },
          take: 25,
          orderBy: { createdAt: "desc" },
          include: {
            inventoryItem: {
              select: { name: true, strength: true, form: true },
            },
            performedBy: {
              select: { firstName: true, lastName: true, role: true },
            },
          },
        }),
      ]);

      if (!profile) {
        sendJson(res, 404, { message: "Patient clinical profile not found." });
        return;
      }

      const totalLogs = profile.adherenceLogs.length;
      const takenLogs = profile.adherenceLogs.filter((l) => l.status === "TAKEN").length;
      const missedLogs = profile.adherenceLogs.filter((l) => l.status === "MISSED").length;
      const skippedLogs = profile.adherenceLogs.filter((l) => l.status === "SKIPPED").length;
      const adherenceRate = totalLogs > 0 ? Math.round((takenLogs / totalLogs) * 100) : null;

      sendJson(res, 200, {
        id: profile.id,
        userId: profile.userId,
        name: `${profile.user.firstName} ${profile.user.lastName}`.trim(),
        firstName: profile.user.firstName,
        lastName: profile.user.lastName,
        email: profile.user.email,
        emailVerified: Boolean(profile.user.emailVerified),
        status: profile.user.status,
        phone: profile.user.phone || null,
        idNumber: profile.idNumber,
        department: profile.department,
        type: profile.user.userType,
        dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.toISOString() : null,
        gender: profile.gender || null,
        bloodType: profile.bloodType || null,
        allergies: profile.allergies || null,
        medicalConditions: profile.medicalConditions || null,
        emergencyContactName: profile.emergencyContactName || null,
        emergencyContactPhone: profile.emergencyContactPhone || null,
        privacyConsentAt: profile.privacyConsentAt
          ? profile.privacyConsentAt.toISOString()
          : null,
        registeredAt: profile.user.createdAt.toISOString(),
        prescriptions: profile.prescriptions.map((rx) => ({
          id: rx.id,
          name: rx.name,
          dosage: rx.dosage,
          form: rx.form || "Tablet",
          frequency: rx.frequency,
          scheduleTimes: rx.scheduleTimes,
          instructions: rx.instructions,
          startDate: rx.startDate.toISOString(),
          endDate: rx.endDate ? rx.endDate.toISOString() : null,
          status: rx.status,
          prescribedBy: rx.doctor
            ? `Dr. ${rx.doctor.firstName} ${rx.doctor.lastName}`.trim()
            : "CSU Clinic",
          doctorSpecialization: rx.doctor?.specialization || null,
        })),
        appointments: profile.appointments.map((apt) => ({
          id: apt.id,
          scheduledAt: apt.scheduledAt.toISOString(),
          completedAt: apt.completedAt ? apt.completedAt.toISOString() : null,
          type: apt.type,
          status: apt.status,
          reason: apt.reason,
          patientNotes: apt.patientNotes,
          clinicalNotes: apt.clinicalNotes,
          cancellationReason: apt.cancellationReason,
          rejectionReason: apt.rejectionReason,
          providerName: apt.provider
            ? `Dr. ${apt.provider.firstName} ${apt.provider.lastName}`.trim()
            : "Unassigned Duty Doctor",
          providerSpecialization: apt.provider?.specialization || null,
        })),
        adherence: {
          rate: adherenceRate,
          total: totalLogs,
          taken: takenLogs,
          missed: missedLogs,
          skipped: skippedLogs,
          logs: profile.adherenceLogs.map((l) => ({
            id: l.id,
            medication: `${l.prescription.name} ${l.prescription.dosage}`,
            scheduledTime: l.scheduledTime.toISOString(),
            takenTime: l.takenTime ? l.takenTime.toISOString() : null,
            status: l.status,
            notes: l.notes,
          })),
        },
        dispensations: dispensationsRaw.map((tx) => ({
          id: tx.id,
          medicationName: tx.inventoryItem.name,
          strength: tx.inventoryItem.strength,
          form: tx.inventoryItem.form,
          quantity: Math.abs(tx.quantity),
          type: tx.type,
          batchNumber: tx.batchNumber,
          reason: tx.reason,
          performedBy: `${tx.performedBy.role === "DOCTOR" ? "Dr. " : ""}${tx.performedBy.firstName} ${tx.performedBy.lastName}`.trim(),
          createdAt: tx.createdAt.toISOString(),
        })),
      });
      return;
    } catch (err: any) {
      console.error("GET /patients/:id error:", err);
      sendJson(res, 500, { message: err.message || "Failed to load patient chart." });
      return;
    }
  }

  // 2. POST /patients (Enrol CSU Patient)
  if (req.method === "POST" && pathname === "/patients") {
    try {
      const body = await readJsonBody(req);
      const {
        firstName,
        lastName,
        email,
        phone,
        idNumber,
        department,
        userType,
        dateOfBirth,
        gender,
        bloodType,
        allergies,
        medicalConditions,
        emergencyContactName,
        emergencyContactPhone,
      } = body;

      const cleanFirst = typeof firstName === "string" ? firstName.trim() : "";
      const cleanLast = typeof lastName === "string" ? lastName.trim() : "";
      const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
      const cleanId = typeof idNumber === "string" ? idNumber.trim() : "";
      const cleanDept = typeof department === "string" ? department.trim() : "";
      const cleanPhone = typeof phone === "string" ? phone.trim() : "";
      const cleanEmergPhone =
        typeof emergencyContactPhone === "string" ? emergencyContactPhone.trim() : "";

      if (!cleanFirst || !cleanLast || !cleanEmail || !cleanId || !cleanDept) {
        sendJson(res, 400, {
          message:
            "First name, last name, email, CSU ID number, and college/unit are required.",
        });
        return;
      }

      if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
        sendJson(res, 400, { message: "Please enter a valid email address." });
        return;
      }

      if (!isValidCsuId(cleanId)) {
        sendJson(res, 400, {
          message: "Invalid CSU ID Number format (e.g. 221-00675 or 2022-04912).",
        });
        return;
      }

      if (cleanPhone && !isValidPhPhone(cleanPhone)) {
        sendJson(res, 400, {
          message: "Please enter a valid Philippine mobile number (e.g. 0912 345 6789).",
        });
        return;
      }

      if (cleanEmergPhone && !isValidPhPhone(cleanEmergPhone)) {
        sendJson(res, 400, {
          message: "Please enter a valid mobile number for the emergency contact.",
        });
        return;
      }

      const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
      const existingIdOwner = await prisma.patientProfile.findUnique({
        where: { idNumber: cleanId },
      });

      if (existingIdOwner && (!existingUser || existingIdOwner.userId !== existingUser.id)) {
        sendJson(res, 409, {
          message: `CSU ID Number "${cleanId}" is already registered to another patient.`,
        });
        return;
      }

      const parsedDob = parseOptionalDob(dateOfBirth);

      const userRecord = await prisma.user.upsert({
        where: { email: cleanEmail },
        update: {
          name: `${cleanFirst} ${cleanLast}`.trim(),
          firstName: cleanFirst,
          lastName: cleanLast,
          phone: cleanPhone || null,
          userType: userType === "EMPLOYEE" ? "EMPLOYEE" : "STUDENT",
        },
        create: {
          name: `${cleanFirst} ${cleanLast}`.trim(),
          email: cleanEmail,
          emailVerified: false,
          firstName: cleanFirst,
          lastName: cleanLast,
          phone: cleanPhone || null,
          role: "PATIENT",
          userType: userType === "EMPLOYEE" ? "EMPLOYEE" : "STUDENT",
          status: "ACTIVE",
        },
      });

      const profile = await prisma.patientProfile.upsert({
        where: { userId: userRecord.id },
        update: {
          idNumber: cleanId,
          department: cleanDept,
          dateOfBirth: parsedDob,
          gender: typeof gender === "string" && gender.trim() ? gender.trim() : null,
          bloodType: typeof bloodType === "string" && bloodType.trim() ? bloodType.trim() : null,
          allergies: typeof allergies === "string" && allergies.trim() ? allergies.trim() : null,
          medicalConditions:
            typeof medicalConditions === "string" && medicalConditions.trim()
              ? medicalConditions.trim()
              : null,
          emergencyContactName:
            typeof emergencyContactName === "string" && emergencyContactName.trim()
              ? emergencyContactName.trim()
              : null,
          emergencyContactPhone: cleanEmergPhone || null,
        },
        create: {
          userId: userRecord.id,
          idNumber: cleanId,
          department: cleanDept,
          dateOfBirth: parsedDob,
          gender: typeof gender === "string" && gender.trim() ? gender.trim() : null,
          bloodType: typeof bloodType === "string" && bloodType.trim() ? bloodType.trim() : null,
          allergies: typeof allergies === "string" && allergies.trim() ? allergies.trim() : null,
          medicalConditions:
            typeof medicalConditions === "string" && medicalConditions.trim()
              ? medicalConditions.trim()
              : null,
          emergencyContactName:
            typeof emergencyContactName === "string" && emergencyContactName.trim()
              ? emergencyContactName.trim()
              : null,
          emergencyContactPhone: cleanEmergPhone || null,
        },
        include: PATIENT_INCLUDE,
      });

      sendJson(res, 201, {
        patient: formatPatientRecord(profile),
        profile,
        user: userRecord,
      });
      return;
    } catch (err: any) {
      console.error("Enrol patient error:", err);
      sendJson(res, 500, { message: err.message || "Failed to enrol patient" });
      return;
    }
  }

  // 3. PATCH /patients/:id (Clinician Edit Patient Clinical Record)
  const patchMatch = pathname.match(/^\/patients\/([^/]+)$/);
  if (req.method === "PATCH" && patchMatch) {
    try {
      const patientId = patchMatch[1]!;
      const existing = await prisma.patientProfile.findUnique({
        where: { id: patientId },
        include: { user: true },
      });

      if (!existing) {
        sendJson(res, 404, { message: "Patient profile not found." });
        return;
      }

      const body = await readJsonBody(req);
      const cleanFirst =
        typeof body.firstName === "string" ? body.firstName.trim() : undefined;
      const cleanLast =
        typeof body.lastName === "string" ? body.lastName.trim() : undefined;
      const cleanPhone =
        typeof body.phone === "string" ? body.phone.trim() || null : undefined;
      const cleanId =
        typeof body.idNumber === "string" ? body.idNumber.trim() : undefined;
      const cleanDept =
        typeof body.department === "string" ? body.department.trim() : undefined;
      const cleanUserType =
        body.userType === "EMPLOYEE" || body.userType === "STUDENT"
          ? (body.userType as "STUDENT" | "EMPLOYEE")
          : undefined;
      const cleanGender =
        typeof body.gender === "string" ? body.gender.trim() || null : undefined;
      const cleanBloodType =
        typeof body.bloodType === "string" ? body.bloodType.trim() || null : undefined;
      const cleanAllergies =
        typeof body.allergies === "string" ? body.allergies.trim() || null : undefined;
      const cleanConditions =
        typeof body.medicalConditions === "string"
          ? body.medicalConditions.trim() || null
          : undefined;
      const cleanEmergName =
        typeof body.emergencyContactName === "string"
          ? body.emergencyContactName.trim() || null
          : undefined;
      const cleanEmergPhone =
        typeof body.emergencyContactPhone === "string"
          ? body.emergencyContactPhone.trim() || null
          : undefined;
      const parsedDob =
        body.dateOfBirth !== undefined ? parseOptionalDob(body.dateOfBirth) : undefined;

      if (cleanFirst !== undefined && !cleanFirst) {
        sendJson(res, 400, { message: "First name cannot be empty." });
        return;
      }
      if (cleanLast !== undefined && !cleanLast) {
        sendJson(res, 400, { message: "Last name cannot be empty." });
        return;
      }
      if (cleanId !== undefined) {
        if (!isValidCsuId(cleanId)) {
          sendJson(res, 400, {
            message: "Invalid CSU ID Number format (e.g. 221-00675 or 2022-04912).",
          });
          return;
        }
        if (cleanId !== existing.idNumber) {
          const duplicate = await prisma.patientProfile.findUnique({
            where: { idNumber: cleanId },
          });
          if (duplicate && duplicate.id !== existing.id) {
            sendJson(res, 409, {
              message: `CSU ID Number "${cleanId}" is already registered to another patient.`,
            });
            return;
          }
        }
      }
      if (cleanPhone && !isValidPhPhone(cleanPhone)) {
        sendJson(res, 400, {
          message: "Please enter a valid Philippine mobile number (e.g. 0912 345 6789).",
        });
        return;
      }
      if (cleanEmergPhone && !isValidPhPhone(cleanEmergPhone)) {
        sendJson(res, 400, {
          message: "Please enter a valid mobile number for the emergency contact.",
        });
        return;
      }

      const nextFirst = cleanFirst ?? existing.user.firstName;
      const nextLast = cleanLast ?? existing.user.lastName;

      await prisma.user.update({
        where: { id: existing.userId },
        data: {
          ...(cleanFirst !== undefined ? { firstName: nextFirst } : {}),
          ...(cleanLast !== undefined ? { lastName: nextLast } : {}),
          ...(cleanFirst !== undefined || cleanLast !== undefined
            ? { name: `${nextFirst} ${nextLast}`.trim() }
            : {}),
          ...(cleanPhone !== undefined ? { phone: cleanPhone } : {}),
          ...(cleanUserType !== undefined ? { userType: cleanUserType } : {}),
        },
      });

      const updatedProfile = await prisma.patientProfile.update({
        where: { id: patientId },
        data: {
          ...(cleanId !== undefined ? { idNumber: cleanId } : {}),
          ...(cleanDept !== undefined && cleanDept ? { department: cleanDept } : {}),
          ...(parsedDob !== undefined ? { dateOfBirth: parsedDob } : {}),
          ...(cleanGender !== undefined ? { gender: cleanGender } : {}),
          ...(cleanBloodType !== undefined ? { bloodType: cleanBloodType } : {}),
          ...(cleanAllergies !== undefined ? { allergies: cleanAllergies } : {}),
          ...(cleanConditions !== undefined ? { medicalConditions: cleanConditions } : {}),
          ...(cleanEmergName !== undefined ? { emergencyContactName: cleanEmergName } : {}),
          ...(cleanEmergPhone !== undefined ? { emergencyContactPhone: cleanEmergPhone } : {}),
        },
        include: PATIENT_INCLUDE,
      });

      sendJson(res, 200, formatPatientRecord(updatedProfile));
      return;
    } catch (err: any) {
      console.error("PATCH /patients/:id error:", err);
      sendJson(res, 500, { message: err.message || "Failed to update patient clinical record." });
      return;
    }
  }

  sendJson(res, 405, { message: "Method not allowed" });
}
