import type { IncomingMessage, ServerResponse } from "node:http";
import { prisma } from "@pillpal/database";
import { supabase } from "@pillpal/auth";

async function getAuthenticatedUser(req: IncomingMessage) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.replace("Bearer ", "").trim();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  return prisma.user.findUnique({
    where: { supabaseUserId: user.id },
  });
}

export async function patientsRoute(req: IncomingMessage, res: ServerResponse) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Unauthorized" }));
    return;
  }

  // Only healthcare providers or admins can access patient records
  if (user.role !== "DOCTOR" && user.role !== "HEALTH_STAFF" && user.role !== "ADMIN") {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Forbidden: Clinician access required" }));
    return;
  }

  const url = new URL(req.url || "/", "http://localhost:4000");

  // GET /patients (list or search)
  if (req.method === "GET") {
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
      include: {
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
          where: { status: "ACTIVE" },
          select: { id: true, name: true, dosage: true },
        },
        adherenceLogs: {
          take: 20,
          orderBy: { createdAt: "desc" },
          select: { status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = patients.map((p) => {
      const logs = p.adherenceLogs;
      const taken = logs.filter((l) => l.status === "TAKEN").length;
      const rate = logs.length > 0 ? Math.round((taken / logs.length) * 100) : 100;

      return {
        id: p.id,
        userId: p.userId,
        name: `${p.user.firstName} ${p.user.lastName}`,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        email: p.user.email,
        phone: p.user.phone || "N/A",
        idNumber: p.idNumber,
        department: p.department,
        type: p.user.userType,
        gender: p.gender || "Not specified",
        bloodType: p.bloodType || "Unknown",
        allergies: p.allergies || "None reported",
        medicalConditions: p.medicalConditions || "None recorded",
        emergencyContactName: p.emergencyContactName || "N/A",
        emergencyContactPhone: p.emergencyContactPhone || "N/A",
        activeMedicationsCount: p.prescriptions.length,
        prescriptions: p.prescriptions,
        adherenceRate: rate,
        status: p.user.status,
      };
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(formatted));
    return;
  }

  // POST /patients (Enrol CSU Patient)
  if (req.method === "POST") {
    try {
      let bodyStr = "";
      req.on("data", (chunk) => {
        bodyStr += chunk.toString();
      });

      await new Promise<void>((resolve, reject) => {
        req.on("end", () => resolve());
        req.on("error", reject);
      });

      const body = bodyStr ? JSON.parse(bodyStr) : {};
      const {
        firstName,
        lastName,
        email,
        phone,
        idNumber,
        department,
        userType,
        gender,
        bloodType,
        allergies,
        medicalConditions,
        emergencyContactName,
        emergencyContactPhone,
      } = body;

      if (!firstName || !lastName || !email || !idNumber || !department) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "First name, last name, email, CSU ID number, and department are required." }));
        return;
      }

      // Upsert User
      const userRecord = await prisma.user.upsert({
        where: { email },
        update: {
          firstName,
          lastName,
          phone: phone || null,
          userType: userType === "EMPLOYEE" ? "EMPLOYEE" : "STUDENT",
        },
        create: {
          supabaseUserId: `csu-patient-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          email,
          firstName,
          lastName,
          phone: phone || null,
          role: "PATIENT",
          userType: userType === "EMPLOYEE" ? "EMPLOYEE" : "STUDENT",
          status: "ACTIVE",
        },
      });

      // Upsert PatientProfile
      const profile = await prisma.patientProfile.upsert({
        where: { userId: userRecord.id },
        update: {
          idNumber,
          department,
          gender: gender || null,
          bloodType: bloodType || null,
          allergies: allergies || null,
          medicalConditions: medicalConditions || null,
          emergencyContactName: emergencyContactName || null,
          emergencyContactPhone: emergencyContactPhone || null,
        },
        create: {
          userId: userRecord.id,
          idNumber,
          department,
          gender: gender || null,
          bloodType: bloodType || null,
          allergies: allergies || null,
          medicalConditions: medicalConditions || null,
          emergencyContactName: emergencyContactName || null,
          emergencyContactPhone: emergencyContactPhone || null,
        },
      });

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ profile, user: userRecord }));
      return;
    } catch (err: any) {
      console.error("Enrol patient error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: err.message || "Failed to enrol patient" }));
      return;
    }
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ message: "Method not allowed" }));
}
