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

function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export async function medicationsRoute(req: IncomingMessage, res: ServerResponse) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    sendJson(res, 401, { message: "Unauthorized" });
    return;
  }

  const url = new URL(req.url || "/", "http://localhost:4000");
  const pathname = url.pathname;

  // 1. GET /medications
  if (req.method === "GET" && pathname === "/medications") {
    const whereClause: any = {};
    if (user.role === "PATIENT") {
      const patientProfile = await prisma.patientProfile.findUnique({
        where: { userId: user.id },
      });
      if (!patientProfile) {
        sendJson(res, 200, []);
        return;
      }
      whereClause.patientId = patientProfile.id;
    }

    const prescriptions = await prisma.prescription.findMany({
      where: whereClause,
      include: {
        patient: {
          include: {
            user: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        },
        doctor: {
          select: { firstName: true, lastName: true, specialization: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = prescriptions.map((p) => ({
      id: p.id,
      patientId: p.patientId,
      patientName: `${p.patient.user.firstName} ${p.patient.user.lastName}`,
      idNumber: p.patient.idNumber,
      name: p.name,
      dosage: p.dosage,
      frequency: p.frequency,
      instructions: p.instructions,
      scheduleTimes: p.scheduleTimes,
      startDate: p.startDate,
      endDate: p.endDate,
      status: p.status,
      prescribedBy: p.doctor ? `Dr. ${p.doctor.firstName} ${p.doctor.lastName}` : "CSU Clinic",
    }));

    sendJson(res, 200, formatted);
    return;
  }

  // 2. POST /medications (Doctor Prescriptions + Optional Direct Dispensing)
  if (req.method === "POST" && pathname === "/medications") {
    if (user.role !== "DOCTOR" && user.role !== "ADMIN") {
      sendJson(res, 403, { message: "Only licensed doctors can issue new prescriptions." });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const {
        patientId,
        name,
        dosage,
        frequency,
        scheduleTimes,
        instructions,
        startDate,
        endDate,
        inventoryItemId,
        dispenseQuantity,
      } = body;

      if (!patientId || !name || !dosage || !frequency || !scheduleTimes || scheduleTimes.length === 0) {
        sendJson(res, 400, {
          message: "Patient, medication name, dosage, frequency, and schedule times are required.",
        });
        return;
      }

      const dispenseQty = dispenseQuantity ? parseInt(dispenseQuantity, 10) : 0;

      // If dispensing from inventory, check stock and batches first
      let inventoryItem = null;
      if (dispenseQty > 0 && inventoryItemId) {
        inventoryItem = await prisma.inventoryItem.findUnique({
          where: { id: inventoryItemId },
          include: {
            batches: {
              where: { quantity: { gt: 0 } },
              orderBy: { expiryDate: "asc" },
            },
          },
        });

        if (!inventoryItem) {
          sendJson(res, 404, { message: "Selected inventory item not found." });
          return;
        }

        if (inventoryItem.currentStock < dispenseQty) {
          sendJson(res, 400, {
            message: `Insufficient inventory stock. Available: ${inventoryItem.currentStock}, Requested to dispense: ${dispenseQty}`,
          });
          return;
        }
      }

      // Create the prescription record
      const prescription = await prisma.prescription.create({
        data: {
          patientId,
          doctorId: user.id,
          name,
          dosage,
          frequency,
          instructions: instructions || null,
          scheduleTimes,
          startDate: startDate ? new Date(startDate) : new Date(),
          endDate: endDate ? new Date(endDate) : null,
          status: "ACTIVE",
        },
      });

      // If dispensing, deduct stock via FEFO and record inventory transaction
      let transactionRecord = null;
      if (inventoryItem && dispenseQty > 0) {
        const previousStock = inventoryItem.currentStock;
        const newStock = previousStock - dispenseQty;
        const newStatus =
          newStock === 0
            ? "OUT_OF_STOCK"
            : newStock <= inventoryItem.minimumStock
              ? "LOW_STOCK"
              : "AVAILABLE";

        let remainingToDeduct = dispenseQty;
        const batchUpdates = [];
        for (const b of inventoryItem.batches) {
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
            where: { id: inventoryItem.id },
            data: { currentStock: newStock, status: newStatus },
          }),
          ...batchUpdates,
          prisma.inventoryTransaction.create({
            data: {
              inventoryItemId: inventoryItem.id,
              type: "DISPENSED_RX",
              quantity: -dispenseQty,
              previousStock,
              newStock,
              patientId,
              prescriptionId: prescription.id,
              performedById: user.id,
              reason: `Prescribed & Dispensed by Dr. ${user.firstName} ${user.lastName} (${dispenseQty} units given)`,
            },
          }),
        ]);

        transactionRecord = {
          dispensedUnits: dispenseQty,
          remainingStock: updatedInv.currentStock,
          transactionId: createdTx.id,
        };
      }

      sendJson(res, 201, {
        ...prescription,
        dispensed: transactionRecord,
      });
      return;
    } catch (err: any) {
      console.error("POST /medications error:", err);
      sendJson(res, 500, { message: err.message || "Failed to create prescription" });
      return;
    }
  }

  // 3. POST /medications/:id/dispense (Dispense Dose / Refill to Patient for an existing Prescription)
  const dispensePrescriptionMatch = pathname.match(/^\/medications\/([^/]+)\/dispense$/);
  if (req.method === "POST" && dispensePrescriptionMatch) {
    if (user.role !== "DOCTOR" && user.role !== "HEALTH_STAFF" && user.role !== "ADMIN") {
      sendJson(res, 403, { message: "Only Clinical Staff can dispense medications." });
      return;
    }

    const prescriptionId = dispensePrescriptionMatch[1];
    if (!prescriptionId) {
      sendJson(res, 400, { message: "Prescription ID is required" });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const { quantity, inventoryItemId, reason } = body;
      const qty = parseInt(quantity, 10) || 1;

      const prescription = await prisma.prescription.findUnique({
        where: { id: prescriptionId },
        include: { patient: true },
      });

      if (!prescription) {
        sendJson(res, 404, { message: "Prescription not found." });
        return;
      }

      // Find matching inventory item
      let item = null;
      if (inventoryItemId) {
        item = await prisma.inventoryItem.findUnique({
          where: { id: inventoryItemId },
          include: {
            batches: {
              where: { quantity: { gt: 0 } },
              orderBy: { expiryDate: "asc" },
            },
          },
        });
      } else {
        // Look up by name
        item = await prisma.inventoryItem.findFirst({
          where: {
            OR: [
              { name: { contains: prescription.name, mode: "insensitive" } },
              { brandName: { contains: prescription.name, mode: "insensitive" } },
            ],
          },
          include: {
            batches: {
              where: { quantity: { gt: 0 } },
              orderBy: { expiryDate: "asc" },
            },
          },
        });
      }

      if (!item) {
        sendJson(res, 404, {
          message: `No matching clinic inventory stock found for "${prescription.name}". Please select an inventory item.`,
        });
        return;
      }

      if (item.currentStock < qty) {
        sendJson(res, 400, {
          message: `Insufficient stock for ${item.name}. Available: ${item.currentStock}, Requested: ${qty}`,
        });
        return;
      }

      const previousStock = item.currentStock;
      const newStock = previousStock - qty;
      const newStatus =
        newStock === 0
          ? "OUT_OF_STOCK"
          : newStock <= item.minimumStock
            ? "LOW_STOCK"
            : "AVAILABLE";

      let remainingToDeduct = qty;
      const batchUpdates = [];
      for (const b of item.batches) {
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

      const [updatedItem, transaction] = await prisma.$transaction([
        prisma.inventoryItem.update({
          where: { id: item.id },
          data: { currentStock: newStock, status: newStatus },
        }),
        ...batchUpdates,
        prisma.inventoryTransaction.create({
          data: {
            inventoryItemId: item.id,
            type: "DISPENSED_RX",
            quantity: -qty,
            previousStock,
            newStock,
            patientId: prescription.patientId,
            prescriptionId: prescription.id,
            performedById: user.id,
            reason: reason || `Dispensed prescription refill (${qty} units given by ${user.firstName} ${user.lastName})`,
          },
        }),
      ]);

      sendJson(res, 200, {
        message: `Successfully dispensed ${qty} units of ${item.name} to patient.`,
        item: updatedItem,
        transaction,
      });
      return;
    } catch (err: any) {
      console.error("POST /medications/:id/dispense error:", err);
      sendJson(res, 500, { message: err.message || "Failed to dispense medication" });
      return;
    }
  }

  sendJson(res, 404, { message: "Endpoint not found" });
}
