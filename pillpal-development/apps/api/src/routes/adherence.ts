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
    include: { patientProfile: true },
  });
}

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

export async function adherenceRoute(req: IncomingMessage, res: ServerResponse) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    sendJson(res, 401, { message: "Unauthorized" });
    return;
  }

  // GET /adherence
  if (req.method === "GET") {
    try {
      if (user.role === "PATIENT") {
        const patientProfile = user.patientProfile;
        if (!patientProfile) {
          sendJson(res, 200, {
            overallRate: 100,
            weekRate: 100,
            monthRate: 100,
            activeStreak: 0,
            totalLogs: 0,
            takenLogs: 0,
            missedLogs: 0,
            skippedLogs: 0,
            todayDoses: [],
            logs: [],
          });
          return;
        }

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const [patientLogs, weekLogs, monthLogs, activePrescriptions, todayLogs] = await Promise.all([
          prisma.adherenceLog.findMany({
            where: { patientId: patientProfile.id },
            orderBy: { scheduledTime: "desc" },
            take: 50,
            include: {
              prescription: {
                select: { name: true, dosage: true, form: true, instructions: true },
              },
            },
          }),
          prisma.adherenceLog.findMany({
            where: { patientId: patientProfile.id, scheduledTime: { gte: sevenDaysAgo } },
          }),
          prisma.adherenceLog.findMany({
            where: { patientId: patientProfile.id, scheduledTime: { gte: thirtyDaysAgo } },
          }),
          prisma.prescription.findMany({
            where: { patientId: patientProfile.id, status: "ACTIVE" },
          }),
          prisma.adherenceLog.findMany({
            where: {
              patientId: patientProfile.id,
              scheduledTime: { gte: startOfToday, lte: endOfToday },
            },
            include: {
              prescription: { select: { name: true, dosage: true } },
            },
          }),
        ]);

        const totalLogs = patientLogs.length;
        const takenLogs = patientLogs.filter((l) => l.status === "TAKEN").length;
        const missedLogs = patientLogs.filter((l) => l.status === "MISSED").length;
        const skippedLogs = patientLogs.filter((l) => l.status === "SKIPPED").length;

        const overallRate = totalLogs > 0 ? Math.round((takenLogs / totalLogs) * 100) : 100;
        const weekRate =
          weekLogs.length > 0
            ? Math.round((weekLogs.filter((l) => l.status === "TAKEN").length / weekLogs.length) * 100)
            : 100;
        const monthRate =
          monthLogs.length > 0
            ? Math.round((monthLogs.filter((l) => l.status === "TAKEN").length / monthLogs.length) * 100)
            : 100;

        // Calculate simple streak of consecutive days with taken doses
        let activeStreak = 0;
        const uniqueTakenDays = new Set(
          patientLogs
            .filter((l) => l.status === "TAKEN")
            .map((l) => new Date(l.scheduledTime).toISOString().split("T")[0])
        );
        for (let d = 0; d < 30; d++) {
          const checkDate = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
          const dateKey = checkDate.toISOString().split("T")[0];
          if (uniqueTakenDays.has(dateKey)) {
            activeStreak++;
          } else if (d > 0) {
            break;
          }
        }

        // Build today's scheduled doses from active prescriptions
        const todayDoses: any[] = [];
        for (const rx of activePrescriptions) {
          for (const timeStr of rx.scheduleTimes) {
            // Find if there's a log for this prescription and approximate time today
            const matchedLog = todayLogs.find((l) => l.prescriptionId === rx.id);
            todayDoses.push({
              prescriptionId: rx.id,
              name: rx.name,
              dosage: rx.dosage,
              form: rx.form || "Tablet",
              time: timeStr,
              instructions: rx.instructions,
              logId: matchedLog?.id || null,
              status: matchedLog ? matchedLog.status : "PENDING",
              notes: matchedLog?.notes || null,
              takenTime: matchedLog?.takenTime?.toISOString() || null,
            });
          }
        }

        sendJson(res, 200, {
          overallRate,
          weekRate,
          monthRate,
          activeStreak: activeStreak || 1,
          totalLogs,
          takenLogs,
          missedLogs,
          skippedLogs,
          todayDoses,
          logs: patientLogs.map((l) => ({
            id: l.id,
            prescriptionId: l.prescriptionId,
            medication: `${l.prescription.name} ${l.prescription.dosage}`,
            scheduledTime: l.scheduledTime.toISOString(),
            takenTime: l.takenTime ? l.takenTime.toISOString() : null,
            status: l.status,
            notes: l.notes,
            createdAt: l.createdAt.toISOString(),
          })),
        });
        return;
      }

      // Clinic-wide for DOCTOR / HEALTH_STAFF / ADMIN
      const logs = await prisma.adherenceLog.findMany({
        take: 50,
        orderBy: { createdAt: "desc" },
        include: {
          patient: {
            include: {
              user: {
                select: { firstName: true, lastName: true },
              },
            },
          },
          prescription: {
            select: { name: true, dosage: true },
          },
        },
      });

      const totalLogs = await prisma.adherenceLog.count();
      const takenLogs = await prisma.adherenceLog.count({ where: { status: "TAKEN" } });
      const missedLogs = await prisma.adherenceLog.count({ where: { status: "MISSED" } });
      const overallRate = totalLogs > 0 ? Math.round((takenLogs / totalLogs) * 100) : 100;

      const formatted = logs.map((l) => ({
        id: l.id,
        patientName: `${l.patient.user.firstName} ${l.patient.user.lastName}`,
        idNumber: l.patient.idNumber,
        medication: `${l.prescription.name} ${l.prescription.dosage}`,
        scheduledTime: l.scheduledTime.toISOString(),
        takenTime: l.takenTime ? l.takenTime.toISOString() : null,
        status: l.status,
        notes: l.notes,
        createdAt: l.createdAt.toISOString(),
      }));

      sendJson(res, 200, {
        overallRate,
        totalLogs,
        takenLogs,
        missedLogs,
        logs: formatted,
      });
      return;
    } catch (err: any) {
      console.error("GET /adherence error:", err);
      sendJson(res, 500, { message: err.message || "Failed to load adherence data" });
      return;
    }
  }

  // POST /adherence (Record dose intake / skip / miss)
  if (req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      let { patientId, prescriptionId, scheduledTime, takenTime, status, notes } = body;

      if (user.role === "PATIENT") {
        if (!user.patientProfile) {
          sendJson(res, 400, { message: "Patient profile not found." });
          return;
        }
        patientId = user.patientProfile.id;
      }

      if (!patientId || !prescriptionId) {
        sendJson(res, 400, {
          message: "patientId and prescriptionId are required.",
        });
        return;
      }

      const log = await prisma.adherenceLog.create({
        data: {
          patientId,
          prescriptionId,
          scheduledTime: scheduledTime ? new Date(scheduledTime) : new Date(),
          takenTime: takenTime ? new Date(takenTime) : status === "TAKEN" || !status ? new Date() : null,
          status: status || "TAKEN",
          notes: notes || null,
        },
        include: {
          prescription: {
            select: { name: true, dosage: true },
          },
        },
      });

      sendJson(res, 201, {
        message: `Dose logged as ${log.status}`,
        log,
      });
      return;
    } catch (err: any) {
      console.error("POST /adherence error:", err);
      sendJson(res, 500, { message: err.message || "Failed to record adherence log" });
      return;
    }
  }

  sendJson(res, 405, { message: "Method not allowed" });
}
