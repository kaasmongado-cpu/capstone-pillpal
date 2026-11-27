import type { IncomingMessage, ServerResponse } from "node:http";
import { prisma } from "@pillpal/database";
import { getAuthenticatedUser } from "../services/auth.js";
import { autoCancelOverdueAppointments } from "../services/appointments.js";
import {
  classifyAdherenceRisk,
  computeConsecutiveMissed,
  reconcileOverdueDoses,
} from "../services/adherence-monitor.js";

const ACTIVE_APPOINTMENT_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "WAITING",
  "IN_PROGRESS",
  "COMPLETED",
] as const;

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
      await Promise.all([autoCancelOverdueAppointments(), reconcileOverdueDoses()]);

      const reqUrl = new URL(req.url || "/clinical-dashboard", "http://localhost:4000");
      const rawThreshold = Number(reqUrl.searchParams.get("threshold") || 80);
      const threshold = Number.isFinite(rawThreshold)
        ? Math.min(95, Math.max(50, Math.round(rawThreshold)))
        : 80;

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        totalPatients,
        activeMedications,
        totalLogs30d,
        takenLogs30d,
        todayAppointmentsCount,
        pendingTriageCount,
        lowStockCount,
        outOfStockCount,
        allPatientsWithLogs,
        todayAppointmentsRaw,
      ] = await Promise.all([
        prisma.patientProfile.count(),
        prisma.prescription.count({ where: { status: "ACTIVE" } }),
        prisma.adherenceLog.count({
          where: { scheduledTime: { gte: thirtyDaysAgo } },
        }),
        prisma.adherenceLog.count({
          where: {
            scheduledTime: { gte: thirtyDaysAgo },
            status: "TAKEN",
          },
        }),
        prisma.appointment.count({
          where: {
            scheduledAt: { gte: startOfDay, lte: endOfDay },
            status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
          },
        }),
        prisma.appointment.count({
          where: { status: "PENDING" },
        }),
        prisma.inventoryItem.count({
          where: { status: "LOW_STOCK" },
        }),
        prisma.inventoryItem.count({
          where: { status: "OUT_OF_STOCK" },
        }),
        prisma.patientProfile.findMany({
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            prescriptions: {
              where: { status: "ACTIVE" },
              select: { name: true, dosage: true },
            },
            adherenceLogs: {
              where: { scheduledTime: { gte: thirtyDaysAgo } },
              orderBy: { scheduledTime: "desc" },
              select: { status: true, scheduledTime: true },
            },
          },
        }),
        prisma.appointment.findMany({
          where: {
            scheduledAt: { gte: startOfDay, lte: endOfDay },
            status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
          },
          take: 8,
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
        totalLogs30d > 0 ? Math.round((takenLogs30d / totalLogs30d) * 1000) / 10 : null;

      // Analyze patients needing clinical attention based on 30d rate (< threshold), missed doses, or consecutive misses
      const severityOrder = { CRITICAL: 0, WARNING: 1, ON_TRACK: 2 } as const;
      const allFlaggedPatients = allPatientsWithLogs
        .map((p) => {
          const logs = p.adherenceLogs;
          if (logs.length === 0) return null;

          const missedThisWeek = logs.filter(
            (l) => l.status === "MISSED" && l.scheduledTime >= sevenDaysAgo,
          ).length;
          const totalMissed = logs.filter((l) => l.status === "MISSED").length;
          const taken = logs.filter((l) => l.status === "TAKEN").length;
          const rate = Math.round((taken / logs.length) * 100);
          const consecutiveMissed = computeConsecutiveMissed(logs);
          const { severity, alertReasons } = classifyAdherenceRisk({
            adherenceRate: rate,
            missedLogs: totalMissed,
            consecutiveMissed,
            threshold,
          });
          const lastMed = p.prescriptions[0]
            ? `${p.prescriptions[0].name} ${p.prescriptions[0].dosage}`
            : "No active prescription";

          if (severity === "ON_TRACK" && missedThisWeek === 0 && totalMissed === 0) {
            return null;
          }

          return {
            id: p.id,
            userId: p.user.id,
            name: `${p.user.firstName} ${p.user.lastName}`.trim(),
            idNumber: p.idNumber,
            adherenceRate: rate,
            missedDoses: missedThisWeek > 0 ? missedThisWeek : totalMissed,
            consecutiveMissed,
            severity: severity === "ON_TRACK" ? ("WARNING" as const) : severity,
            alertReasons:
              alertReasons.length > 0
                ? alertReasons
                : [`${missedThisWeek || totalMissed} missed dose${(missedThisWeek || totalMissed) === 1 ? "" : "s"}`],
            lastMedication: lastMed,
            condition: p.medicalConditions
              ? p.medicalConditions.split(",")[0]?.trim() || "General Monitoring"
              : "General Monitoring",
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .sort(
          (a, b) =>
            severityOrder[a.severity] - severityOrder[b.severity] ||
            a.adherenceRate - b.adherenceRate,
        );

      const criticalCount = allFlaggedPatients.filter((p) => p.severity === "CRITICAL").length;
      const warningCount = allFlaggedPatients.filter((p) => p.severity === "WARNING").length;
      const attentionPatients = allFlaggedPatients.slice(0, 5);

      const formattedAppointments = todayAppointmentsRaw.map((a) => ({
        id: a.id,
        patientName: `${a.patient.user.firstName} ${a.patient.user.lastName}`.trim(),
        idNumber: a.patient.idNumber,
        time: a.scheduledAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: a.type === "TELEHEALTH" ? "Virtual Teleconsult" : "In-Person Clinic",
        reason: a.reason || "General Consultation",
        status: a.status,
      }));

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          provider: {
            id: user.id,
            name: `${user.firstName} ${user.lastName}`.trim(),
            role: user.role,
            specialization: user.specialization || "General Medicine",
          },
          threshold,
          stats: {
            totalPatients,
            activeMedications,
            averageAdherence,
            totalLogs30d,
            todayAppointments: todayAppointmentsCount,
            criticalAttentionCount: allFlaggedPatients.length,
            criticalCount,
            warningCount,
            pendingTriageCount,
            lowStockCount,
            outOfStockCount,
          },
          attentionPatients,
          upcomingAppointments: formattedAppointments,
        }),
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
