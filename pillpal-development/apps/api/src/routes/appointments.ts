import type { IncomingMessage, ServerResponse } from "node:http";
import { prisma } from "@pillpal/database";
import { supabase } from "@pillpal/auth";
import { autoCancelOverdueAppointments } from "../services/appointments.js";

async function getAuthenticatedUser(req: IncomingMessage) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.replace("Bearer ", "").trim();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
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

export async function appointmentsRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    sendJson(res, 401, { message: "Unauthorized" });
    return;
  }

  const url = new URL(req.url || "/", "http://localhost:4000");
  const pathname = url.pathname;

  // Trigger automated cancellation of any overdue appointments
  await autoCancelOverdueAppointments();

  // POST /appointments/auto-cancel-overdue - Manual or webhook trigger
  if (req.method === "POST" && pathname === "/appointments/auto-cancel-overdue") {
    try {
      const result = await autoCancelOverdueAppointments();
      sendJson(res, 200, {
        message: `Successfully processed overdue appointments.`,
        cancelledCount: result.count,
      });
      return;
    } catch (err: any) {
      sendJson(res, 500, { message: err.message || "Failed to process overdue appointments" });
      return;
    }
  }

  // 0. GET /appointments/doctors - List active clinical doctors for triage assignment
  if (req.method === "GET" && pathname === "/appointments/doctors") {
    try {
      const doctors = await prisma.user.findMany({
        where: {
          role: "DOCTOR",
          status: "ACTIVE",
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          specialization: true,
          workId: true,
        },
        orderBy: { lastName: "asc" },
      });

      sendJson(res, 200, doctors);
      return;
    } catch (err: any) {
      sendJson(res, 500, { message: err.message || "Failed to load doctors" });
      return;
    }
  }

  const searchParams = url.searchParams;

  // 1. GET /appointments - List appointments with filters
  if (req.method === "GET" && pathname === "/appointments") {
    try {
      const statusParam = searchParams.get("status");
      const doctorIdParam = searchParams.get("doctorId");
      const patientIdParam = searchParams.get("patientId");
      const dateParam = searchParams.get("date");
      const queueParam = searchParams.get("queue");

      const whereClause: any = {};

      // If patient, restrict to own appointments
      if (user.role === "PATIENT") {
        if (!user.patientProfile) {
          sendJson(res, 200, []);
          return;
        }
        whereClause.patientId = user.patientProfile.id;
      } else {
        if (patientIdParam) {
          whereClause.patientId = patientIdParam;
        }
        if (doctorIdParam) {
          whereClause.providerId = doctorIdParam;
        }
      }

      // Filter by status
      if (statusParam) {
        whereClause.status = statusParam;
      }

      // Filter by queue type
      if (queueParam === "requests") {
        whereClause.status = "PENDING";
      } else if (queueParam === "lobby") {
        whereClause.status = { in: ["WAITING", "IN_PROGRESS"] };
      } else if (queueParam === "completed") {
        whereClause.status = "COMPLETED";
      } else if (queueParam === "today") {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        whereClause.scheduledAt = { gte: startOfDay, lte: endOfDay };
      }

      // Filter by specific date
      if (dateParam) {
        const targetDate = new Date(dateParam);
        if (!isNaN(targetDate.getTime())) {
          const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
          const end = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
          whereClause.scheduledAt = { gte: start, lte: end };
        }
      }

      const appointments = await prisma.appointment.findMany({
        where: whereClause,
        orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
        include: {
          patient: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
          provider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
              specialization: true,
            },
          },
          confirmedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });

      const formatted = appointments.map((a) => ({
        id: a.id,
        patientId: a.patientId,
        patientName: `${a.patient.user.firstName} ${a.patient.user.lastName}`,
        patientEmail: a.patient.user.email,
        patientPhone: a.patient.user.phone,
        idNumber: a.patient.idNumber,
        department: a.patient.department,
        allergies: a.patient.allergies,
        medicalConditions: a.patient.medicalConditions,
        scheduledAt: a.scheduledAt.toISOString(),
        requestedDate: a.requestedDate?.toISOString() || null,
        reason: a.reason,
        type: a.type,
        status: a.status,
        patientNotes: a.patientNotes,
        clinicalNotes: a.clinicalNotes,
        rejectionReason: a.rejectionReason,
        cancellationReason: a.cancellationReason,
        telehealthUrl: a.telehealthUrl,
        checkedInAt: a.checkedInAt?.toISOString() || null,
        startedAt: a.startedAt?.toISOString() || null,
        completedAt: a.completedAt?.toISOString() || null,
        providerId: a.providerId,
        providerName: a.provider
          ? `Dr. ${a.provider.firstName} ${a.provider.lastName}`
          : "Unassigned Duty Doctor",
        providerSpecialization: a.provider?.specialization || "General Medicine",
        confirmedById: a.confirmedById,
        confirmedByName: a.confirmedBy
          ? `${a.confirmedBy.firstName} ${a.confirmedBy.lastName}`
          : null,
        createdAt: a.createdAt.toISOString(),
      }));

      sendJson(res, 200, formatted);
      return;
    } catch (err: any) {
      console.error("GET /appointments error:", err);
      sendJson(res, 500, { message: err.message || "Failed to fetch appointments" });
      return;
    }
  }

  // 2. GET /appointments/:id - Get single appointment with rich details
  const singleMatch = pathname.match(/^\/appointments\/([a-zA-Z0-9_-]+)$/);
  if (req.method === "GET" && singleMatch) {
    try {
      const id = singleMatch[1];
      if (!id) {
        sendJson(res, 400, { message: "Appointment ID is required" });
        return;
      }
      const appointment = await prisma.appointment.findUnique({
        where: { id },
        include: {
          patient: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
              prescriptions: {
                where: { status: "ACTIVE" },
                orderBy: { createdAt: "desc" },
              },
              adherenceLogs: {
                take: 10,
                orderBy: { scheduledTime: "desc" },
              },
            },
          },
          provider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
              specialization: true,
            },
          },
          confirmedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });

      if (!appointment) {
        sendJson(res, 404, { message: "Appointment not found" });
        return;
      }

      // Check permission if patient
      if (user.role === "PATIENT" && user.patientProfile?.id !== appointment.patientId) {
        sendJson(res, 403, { message: "Access denied" });
        return;
      }

      sendJson(res, 200, appointment);
      return;
    } catch (err: any) {
      sendJson(res, 500, { message: err.message || "Failed to load appointment" });
      return;
    }
  }

  // 3. POST /appointments - Create appointment (Triage request or Walk-in)
  if (req.method === "POST" && pathname === "/appointments") {
    try {
      const body = await readJsonBody(req);
      const {
        patientId,
        scheduledAt,
        requestedDate,
        reason,
        type = "IN_PERSON",
        providerId,
        status = "CONFIRMED",
        patientNotes,
        isWalkIn = false,
      } = body;

      let effectivePatientId = patientId;
      if (user.role === "PATIENT") {
        if (!user.patientProfile) {
          sendJson(res, 400, { message: "Patient profile does not exist for this account." });
          return;
        }
        effectivePatientId = user.patientProfile.id;
      }

      if (!effectivePatientId || !reason) {
        sendJson(res, 400, { message: "patientId and reason are required." });
        return;
      }

      const targetDate = scheduledAt ? new Date(scheduledAt) : new Date();

      // Determine initial status based on user role and walk-in intent
      let initialStatus: "PENDING" | "CONFIRMED" | "WAITING" = "CONFIRMED";
      let checkedInAtTime: Date | null = null;
      let confirmedByUserId: string | null = null;

      if (user.role === "PATIENT") {
        initialStatus = "PENDING";
      } else if (isWalkIn || status === "WAITING") {
        initialStatus = "WAITING";
        checkedInAtTime = new Date();
        confirmedByUserId = user.id;
      } else {
        initialStatus = "CONFIRMED";
        confirmedByUserId = user.id;
      }

      const appointment = await prisma.appointment.create({
        data: {
          patientId: effectivePatientId,
          providerId: providerId || (user.role === "DOCTOR" ? user.id : null),
          confirmedById: confirmedByUserId,
          scheduledAt: targetDate,
          requestedDate: requestedDate ? new Date(requestedDate) : targetDate,
          reason,
          type,
          status: initialStatus,
          patientNotes: patientNotes || null,
          checkedInAt: checkedInAtTime,
        },
        include: {
          patient: {
            include: {
              user: { select: { firstName: true, lastName: true, email: true } },
            },
          },
          provider: {
            select: { firstName: true, lastName: true, specialization: true },
          },
        },
      });

      sendJson(res, 201, appointment);
      return;
    } catch (err: any) {
      console.error("POST /appointments error:", err);
      sendJson(res, 500, { message: err.message || "Failed to schedule appointment" });
      return;
    }
  }

  // 4. POST /appointments/:id/confirm - Health Staff triage approval & Doctor assignment
  const confirmMatch = pathname.match(/^\/appointments\/([a-zA-Z0-9_-]+)\/confirm$/);
  if (req.method === "POST" && confirmMatch) {
    try {
      if (user.role !== "HEALTH_STAFF" && user.role !== "ADMIN" && user.role !== "DOCTOR") {
        sendJson(res, 403, { message: "Forbidden: Clinical staff access required" });
        return;
      }

      const id = confirmMatch[1];
      if (!id) {
        sendJson(res, 400, { message: "Appointment ID is required" });
        return;
      }
      const body = await readJsonBody(req);
      const { providerId, scheduledAt } = body;

      const updateData: any = {
        status: "CONFIRMED",
        confirmedById: user.id,
      };

      if (providerId) {
        updateData.providerId = providerId;
      }
      if (scheduledAt) {
        updateData.scheduledAt = new Date(scheduledAt);
      }

      const updated = await prisma.appointment.update({
        where: { id },
        data: updateData,
        include: {
          patient: {
            include: {
              user: { select: { firstName: true, lastName: true, email: true } },
            },
          },
          provider: {
            select: { firstName: true, lastName: true, specialization: true },
          },
        },
      });

      sendJson(res, 200, updated);
      return;
    } catch (err: any) {
      sendJson(res, 500, { message: err.message || "Failed to confirm appointment" });
      return;
    }
  }

  // 5. POST /appointments/:id/reject - Health Staff decline with reason
  const rejectMatch = pathname.match(/^\/appointments\/([a-zA-Z0-9_-]+)\/reject$/);
  if (req.method === "POST" && rejectMatch) {
    try {
      if (user.role !== "HEALTH_STAFF" && user.role !== "ADMIN") {
        sendJson(res, 403, { message: "Forbidden: Health staff access required" });
        return;
      }

      const id = rejectMatch[1];
      if (!id) {
        sendJson(res, 400, { message: "Appointment ID is required" });
        return;
      }
      const body = await readJsonBody(req);
      const { rejectionReason } = body;

      if (!rejectionReason) {
        sendJson(res, 400, { message: "Rejection reason is required." });
        return;
      }

      const updated = await prisma.appointment.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectionReason,
        },
      });

      sendJson(res, 200, updated);
      return;
    } catch (err: any) {
      sendJson(res, 500, { message: err.message || "Failed to reject appointment" });
      return;
    }
  }

  // 6. POST /appointments/:id/check-in - Patient arrived at reception (marked WAITING)
  const checkInMatch = pathname.match(/^\/appointments\/([a-zA-Z0-9_-]+)\/check-in$/);
  if (req.method === "POST" && checkInMatch) {
    try {
      const id = checkInMatch[1];
      if (!id) {
        sendJson(res, 400, { message: "Appointment ID is required" });
        return;
      }
      const updated = await prisma.appointment.update({
        where: { id },
        data: {
          status: "WAITING",
          checkedInAt: new Date(),
        },
      });

      sendJson(res, 200, updated);
      return;
    } catch (err: any) {
      sendJson(res, 500, { message: err.message || "Failed to check in patient" });
      return;
    }
  }

  // 7. POST /appointments/:id/start - Doctor calls patient into consultation room
  const startMatch = pathname.match(/^\/appointments\/([a-zA-Z0-9_-]+)\/start$/);
  if (req.method === "POST" && startMatch) {
    try {
      if (user.role !== "DOCTOR" && user.role !== "ADMIN") {
        sendJson(res, 403, { message: "Forbidden: Doctor access required to start consultation" });
        return;
      }

      const id = startMatch[1];
      if (!id) {
        sendJson(res, 400, { message: "Appointment ID is required" });
        return;
      }

      const updateData: any = {
        status: "IN_PROGRESS",
        startedAt: new Date(),
      };
      if (user.role === "DOCTOR") {
        updateData.providerId = user.id;
      }

      const updated = await prisma.appointment.update({
        where: { id },
        data: updateData,
      });

      sendJson(res, 200, updated);
      return;
    } catch (err: any) {
      sendJson(res, 500, { message: err.message || "Failed to start consultation" });
      return;
    }
  }

  // 8. POST /appointments/:id/complete - Doctor completes consultation & writes notes/Rx
  const completeMatch = pathname.match(/^\/appointments\/([a-zA-Z0-9_-]+)\/complete$/);
  if (req.method === "POST" && completeMatch) {
    try {
      if (user.role !== "DOCTOR" && user.role !== "ADMIN") {
        sendJson(res, 403, { message: "Forbidden: Doctor access required to complete consultation" });
        return;
      }

      const id = completeMatch[1];
      if (!id) {
        sendJson(res, 400, { message: "Appointment ID is required" });
        return;
      }
      const body = await readJsonBody(req);
      const { clinicalNotes, prescription } = body;

      const updateData: any = {
        status: "COMPLETED",
        clinicalNotes: clinicalNotes || "Consultation completed successfully.",
        completedAt: new Date(),
      };
      if (user.role === "DOCTOR") {
        updateData.providerId = user.id;
      }

      // Update appointment status to COMPLETED
      const updatedAppointment = await prisma.appointment.update({
        where: { id },
        data: updateData,
        include: {
          patient: true,
        },
      });

      // If doctor prescribed medication during consultation, create Prescription & optional stock dispensing
      let createdPrescription = null;
      let inventoryTransactionRecord = null;

      if (prescription && prescription.name && prescription.dosage) {
        const {
          name,
          dosage,
          form,
          instructions,
          frequency,
          scheduleTimes = ["08:00 AM", "08:00 PM"],
          durationDays = 7,
          inventoryItemId,
          dispenseQuantity,
        } = prescription;

        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + Number(durationDays || 7));

        createdPrescription = await prisma.prescription.create({
          data: {
            patientId: updatedAppointment.patientId,
            doctorId: user.id,
            name,
            dosage,
            form: form || "Tablet",
            instructions: instructions || "Take as directed after meals",
            frequency: frequency || "Twice daily",
            scheduleTimes: Array.isArray(scheduleTimes) && scheduleTimes.length > 0 ? scheduleTimes : ["08:00 AM", "08:00 PM"],
            startDate,
            endDate,
            status: "ACTIVE",
          },
        });

        // If dispensing from clinic inventory
        const dispenseQty = dispenseQuantity ? parseInt(dispenseQuantity, 10) : 0;
        if (dispenseQty > 0 && inventoryItemId) {
          const invItem = await prisma.inventoryItem.findUnique({
            where: { id: inventoryItemId },
            include: {
              batches: {
                where: { quantity: { gt: 0 } },
                orderBy: { expiryDate: "asc" },
              },
            },
          });

          if (invItem && invItem.currentStock >= dispenseQty) {
            const previousStock = invItem.currentStock;
            const newStock = previousStock - dispenseQty;
            const newStatus =
              newStock === 0
                ? "OUT_OF_STOCK"
                : newStock <= invItem.minimumStock
                  ? "LOW_STOCK"
                  : "AVAILABLE";

            let remainingToDeduct = dispenseQty;
            const batchUpdates = [];
            for (const b of invItem.batches) {
              if (remainingToDeduct <= 0) break;
              const deductFromBatch = Math.min(b.quantity, remainingToDeduct);
              batchUpdates.push(
                prisma.inventoryBatch.update({
                  where: { id: b.id },
                  data: { quantity: b.quantity - deductFromBatch },
                }),
              );
              remainingToDeduct -= deductFromBatch;
            }

            const [updatedInv, createdTx] = await prisma.$transaction([
              prisma.inventoryItem.update({
                where: { id: invItem.id },
                data: { currentStock: newStock, status: newStatus },
              }),
              ...batchUpdates,
              prisma.inventoryTransaction.create({
                data: {
                  inventoryItemId: invItem.id,
                  type: "DISPENSED_RX",
                  quantity: -dispenseQty,
                  previousStock,
                  newStock,
                  patientId: updatedAppointment.patientId,
                  prescriptionId: createdPrescription.id,
                  performedById: user.id,
                  reason: `Consultation Rx Dispensed by Dr. ${user.firstName} ${user.lastName} (${dispenseQty} units given)`,
                },
              }),
            ]);

            inventoryTransactionRecord = {
              dispensedUnits: dispenseQty,
              remainingStock: updatedInv.currentStock,
              transactionId: createdTx.id,
            };
          }
        }
      }

      sendJson(res, 200, {
        appointment: updatedAppointment,
        prescription: createdPrescription,
        dispensed: inventoryTransactionRecord,
        message: "Consultation successfully completed, prescription created, and medications dispensed.",
      });
      return;
    } catch (err: any) {
      console.error("POST /appointments/:id/complete error:", err);
      sendJson(res, 500, { message: err.message || "Failed to complete consultation" });
      return;
    }
  }

  // 9. POST /appointments/:id/reschedule - Reschedule date/time
  const rescheduleMatch = pathname.match(/^\/appointments\/([a-zA-Z0-9_-]+)\/reschedule$/);
  if (req.method === "POST" && rescheduleMatch) {
    try {
      const id = rescheduleMatch[1];
      if (!id) {
        sendJson(res, 400, { message: "Appointment ID is required" });
        return;
      }
      const body = await readJsonBody(req);
      const { scheduledAt } = body;

      if (!scheduledAt) {
        sendJson(res, 400, { message: "scheduledAt is required." });
        return;
      }

      const updated = await prisma.appointment.update({
        where: { id },
        data: {
          scheduledAt: new Date(scheduledAt),
          status: "CONFIRMED",
        },
      });

      sendJson(res, 200, updated);
      return;
    } catch (err: any) {
      sendJson(res, 500, { message: err.message || "Failed to reschedule appointment" });
      return;
    }
  }

  // 10. POST /appointments/:id/cancel - Cancel appointment
  const cancelMatch = pathname.match(/^\/appointments\/([a-zA-Z0-9_-]+)\/cancel$/);
  if (req.method === "POST" && cancelMatch) {
    try {
      const id = cancelMatch[1];
      if (!id) {
        sendJson(res, 400, { message: "Appointment ID is required" });
        return;
      }
      const body = await readJsonBody(req);
      const { cancellationReason } = body;

      const updated = await prisma.appointment.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancellationReason: cancellationReason || "Cancelled by user or clinic.",
        },
      });

      sendJson(res, 200, updated);
      return;
    } catch (err: any) {
      sendJson(res, 500, { message: err.message || "Failed to cancel appointment" });
      return;
    }
  }

  sendJson(res, 404, { message: "Endpoint not found" });
}
