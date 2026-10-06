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

export async function adherenceRoute(req: IncomingMessage, res: ServerResponse) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Unauthorized" }));
    return;
  }

  // GET /adherence
  if (req.method === "GET") {
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

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        overallRate,
        totalLogs,
        takenLogs,
        missedLogs,
        logs: formatted,
      })
    );
    return;
  }

  // POST /adherence
  if (req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const { patientId, prescriptionId, scheduledTime, takenTime, status, notes } = body;

      if (!patientId || !prescriptionId || !scheduledTime) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "patientId, prescriptionId, and scheduledTime are required." }));
        return;
      }

      const log = await prisma.adherenceLog.create({
        data: {
          patientId,
          prescriptionId,
          scheduledTime: new Date(scheduledTime),
          takenTime: takenTime ? new Date(takenTime) : status === "TAKEN" ? new Date() : null,
          status: status || "TAKEN",
          notes: notes || null,
        },
      });

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(log));
      return;
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: err.message || "Failed to record adherence log" }));
      return;
    }
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ message: "Method not allowed" }));
}
