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

export async function clinicalDashboardRoute(req: IncomingMessage, res: ServerResponse) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Unauthorized" }));
    return;
  }

  if (user.role !== "DOCTOR" && user.role !== "HEALTH_STAFF" && user.role !== "ADMIN") {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Forbidden: Clinical access required" }));
    return;
  }

  if (req.method === "GET") {
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const [
        totalPatients,
        activeMedications,
        totalLogs,
        takenLogs,
        todayAppointmentsCount,
        allPatientsWithLogs,
        upcomingAppointmentsRaw,
      ] = await Promise.all([
        prisma.patientProfile.count(),
        prisma.prescription.count({ where: { status: "ACTIVE" } }),
        prisma.adherenceLog.count(),
        prisma.adherenceLog.count({ where: { status: "TAKEN" } }),
        prisma.appointment.count({
          where: {
            scheduledAt: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
        }),
        prisma.patientProfile.findMany({
          include: {
            user: {
              select: { firstName: true, lastName: true, email: true },
            },
            prescriptions: {
              where: { status: "ACTIVE" },
              select: { name: true, dosage: true },
            },
            adherenceLogs: {
              take: 20,
              orderBy: { scheduledTime: "desc" },
              select: { status: true },
            },
          },
        }),
        prisma.appointment.findMany({
          where: {
            scheduledAt: { gte: startOfDay },
          },
          take: 6,
          orderBy: { scheduledAt: "asc" },
          include: {
            patient: {
              include: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }),
      ]);

      const averageAdherence =
        totalLogs > 0 ? Math.round((takenLogs / totalLogs) * 1000) / 10 : 100;

      // Analyze patients needing attention
      const attentionPatients = allPatientsWithLogs
        .map((p) => {
          const logs = p.adherenceLogs;
          const missed = logs.filter((l) => l.status === "MISSED").length;
          const taken = logs.filter((l) => l.status === "TAKEN").length;
          const rate = logs.length > 0 ? Math.round((taken / logs.length) * 100) : 100;
          const lastMed = p.prescriptions[0]
            ? `${p.prescriptions[0].name} ${p.prescriptions[0].dosage}`
            : "No active prescription";

          return {
            id: p.id,
            name: `${p.user.firstName} ${p.user.lastName}`,
            idNumber: p.idNumber,
            adherenceRate: rate,
            missedDoses: missed,
            lastMedication: lastMed,
            condition: p.medicalConditions ? p.medicalConditions.split(",")[0] : "General Monitoring",
          };
        })
        .filter((p) => p.adherenceRate < 80 || p.missedDoses >= 1)
        .slice(0, 5);

      const formattedAppointments = upcomingAppointmentsRaw.map((a) => ({
        id: a.id,
        patientName: `${a.patient.user.firstName} ${a.patient.user.lastName}`,
        idNumber: a.patient.idNumber,
        time: a.scheduledAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: a.type === "TELEHEALTH" ? "Virtual Teleconsult" : "In-Person Clinic",
        status: a.status,
      }));

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          provider: {
            name: `${user.firstName} ${user.lastName}`,
            role: user.role,
            specialization: user.specialization || "General Medicine",
          },
          stats: {
            totalPatients,
            activeMedications,
            averageAdherence,
            todayAppointments: todayAppointmentsCount,
            criticalAttentionCount: attentionPatients.length,
          },
          attentionPatients,
          upcomingAppointments: formattedAppointments,
        })
      );
      return;
    } catch (err: any) {
      console.error("Clinical dashboard error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: err.message || "Failed to load clinical dashboard" }));
      return;
    }
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ message: "Method not allowed" }));
}
