import type { IncomingMessage, ServerResponse } from "node:http";
import { prisma } from "@pillpal/database";
import { getAuthenticatedUser } from "../services/auth.js";
import { createNotification } from "../services/notifications.js";

type FulfillmentStatus =
  | "CLINIC_DISPENSED"
  | "PARTIAL_EXTERNAL"
  | "EXTERNAL_PHARMACY"
  | "AWAITING_DISPENSE"
  | "UNAVAILABLE_IN_CLINIC"
  | "SELF_SCANNED";

const EXTERNAL_RX_REGEX = /\[External Pharmacy(?::\s*([^\]]+))?\]/i;
const PARTIAL_RX_REGEX = /\[Partial Clinic Dispense(?::\s*([^\]]+))?\]/i;

function parseFulfillmentFromInstructions(raw: string | null): {
  isExternalTagged: boolean;
  isPartialTagged: boolean;
  externalPharmacyNote: string | null;
  cleanInstructions: string | null;
} {
  if (!raw) {
    return {
      isExternalTagged: false,
      isPartialTagged: false,
      externalPharmacyNote: null,
      cleanInstructions: null,
    };
  }

  const partialMatch = raw.match(PARTIAL_RX_REGEX);
  if (partialMatch) {
    const clean = raw.replace(PARTIAL_RX_REGEX, "").replace(/\s*\|\s*$/, "").trim();
    return {
      isExternalTagged: false,
      isPartialTagged: true,
      externalPharmacyNote:
        partialMatch[1]?.trim() ||
        "Starter units dispensed at CSU Clinic; purchase remaining balance at an outside pharmacy.",
      cleanInstructions: clean || null,
    };
  }

  const externalMatch = raw.match(EXTERNAL_RX_REGEX);
  if (externalMatch) {
    const clean = raw.replace(EXTERNAL_RX_REGEX, "").replace(/\s*\|\s*$/, "").trim();
    return {
      isExternalTagged: true,
      isPartialTagged: false,
      externalPharmacyNote:
        externalMatch[1]?.trim() ||
        "Not currently available in CSU Clinic stock; purchase at an external pharmacy.",
      cleanInstructions: clean || null,
    };
  }

  return {
    isExternalTagged: false,
    isPartialTagged: false,
    externalPharmacyNote: null,
    cleanInstructions: raw,
  };
}

function normalizeToken(value: string | null | undefined): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findMatchingInventoryItem<
  T extends {
    id: string;
    name: string;
    brandName: string | null;
    strength: string;
    form: string;
    category: string;
    currentStock: number;
    status: string;
  },
>(rxName: string, rxDosage: string, items: T[]): T | null {
  const normRxName = normalizeToken(rxName);
  if (!normRxName) return null;
  const normRxDosage = normalizeToken(rxDosage);

  const candidates = items.filter((item) => {
    const normItemName = normalizeToken(item.name);
    const normBrand = normalizeToken(item.brandName);
    if (!normItemName) return false;
    return (
      normItemName === normRxName ||
      normRxName.includes(normItemName) ||
      normItemName.includes(normRxName) ||
      (normBrand.length >= 3 &&
        (normBrand === normRxName ||
          normRxName.includes(normBrand) ||
          normBrand.includes(normRxName)))
    );
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const score = (item: T) => {
      let s = 0;
      if (normalizeToken(item.name) === normRxName) s += 4;
      if (normRxDosage && normalizeToken(item.strength) === normRxDosage) s += 3;
      if (item.currentStock > 0) s += 2;
      return s;
    };
    return score(b) - score(a);
  });

  return candidates[0] ?? null;
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

    const [prescriptions, inventoryItems] = await Promise.all([
      prisma.prescription.findMany({
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
      }),
      prisma.inventoryItem.findMany({
        select: {
          id: true,
          name: true,
          brandName: true,
          strength: true,
          form: true,
          category: true,
          currentStock: true,
          status: true,
        },
      }),
    ]);

    const rxIds = prescriptions.map((p) => p.id);
    const dispensedTxs =
      rxIds.length > 0
        ? await prisma.inventoryTransaction.findMany({
            where: {
              prescriptionId: { in: rxIds },
              type: "DISPENSED_RX",
            },
            select: {
              prescriptionId: true,
              quantity: true,
            },
          })
        : [];

    const dispensedByRx = new Map<string, number>();
    for (const tx of dispensedTxs) {
      if (!tx.prescriptionId) continue;
      dispensedByRx.set(
        tx.prescriptionId,
        (dispensedByRx.get(tx.prescriptionId) || 0) + Math.abs(tx.quantity),
      );
    }

    const formatted = prescriptions.map((p) => {
      const dispensedUnits = dispensedByRx.get(p.id) || 0;
      const parsedMeta = parseFulfillmentFromInstructions(p.instructions);
      const stockMatch = findMatchingInventoryItem(p.name, p.dosage, inventoryItems);

      let fulfillmentStatus: FulfillmentStatus;
      if (!p.doctorId) {
        fulfillmentStatus = "SELF_SCANNED";
      } else if (parsedMeta.isPartialTagged) {
        fulfillmentStatus = "PARTIAL_EXTERNAL";
      } else if (parsedMeta.isExternalTagged) {
        fulfillmentStatus = "EXTERNAL_PHARMACY";
      } else if (dispensedUnits > 0) {
        fulfillmentStatus = "CLINIC_DISPENSED";
      } else if (stockMatch && stockMatch.currentStock > 0) {
        fulfillmentStatus = "AWAITING_DISPENSE";
      } else {
        fulfillmentStatus = "UNAVAILABLE_IN_CLINIC";
      }

      return {
        id: p.id,
        patientId: p.patientId,
        patientName: `${p.patient.user.firstName} ${p.patient.user.lastName}`.trim(),
        idNumber: p.patient.idNumber,
        patientDepartment: p.patient.department || null,
        patientAllergies: p.patient.allergies || null,
        name: p.name,
        dosage: p.dosage,
        form: p.form || "Tablet",
        frequency: p.frequency,
        instructions: p.instructions,
        cleanInstructions: parsedMeta.cleanInstructions,
        externalPharmacyNote: parsedMeta.externalPharmacyNote,
        fulfillmentStatus,
        dispensedUnits,
        clinicStockMatch: stockMatch
          ? {
              id: stockMatch.id,
              name: stockMatch.name,
              brandName: stockMatch.brandName,
              strength: stockMatch.strength,
              form: stockMatch.form,
              category: stockMatch.category,
              currentStock: stockMatch.currentStock,
              status: stockMatch.status,
            }
          : null,
        scheduleTimes: p.scheduleTimes,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
        doctorId: p.doctorId,
        source: p.doctorId ? "CLINIC_RX" : "PATIENT_SCANNED",
        prescribedBy: p.doctor ? `Dr. ${p.doctor.firstName} ${p.doctor.lastName}`.trim() : "Self-Scanned / OTC",
        doctorSpecialization: p.doctor?.specialization || null,
      };
    });

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
        form,
        frequency,
        scheduleTimes,
        instructions,
        startDate,
        endDate,
        inventoryItemId,
        dispenseQuantity,
        fulfillmentMode,
        externalQuantity,
        requestRestock,
      } = body;

      if (!patientId || !name || !dosage || !frequency || !scheduleTimes || scheduleTimes.length === 0) {
        sendJson(res, 400, {
          message: "Patient, medication name, dosage, frequency, and schedule times are required.",
        });
        return;
      }

      const normalizedMode: "CLINIC_DISPENSE" | "PARTIAL_EXTERNAL" | "EXTERNAL_PHARMACY" | "CLINIC_NO_DISPENSE" =
        fulfillmentMode === "EXTERNAL_PHARMACY" ||
        fulfillmentMode === "PARTIAL_EXTERNAL" ||
        fulfillmentMode === "CLINIC_DISPENSE" ||
        fulfillmentMode === "CLINIC_NO_DISPENSE"
          ? fulfillmentMode
          : dispenseQuantity && parseInt(dispenseQuantity, 10) > 0 && inventoryItemId
            ? "CLINIC_DISPENSE"
            : "CLINIC_NO_DISPENSE";

      const dispenseQty =
        normalizedMode === "EXTERNAL_PHARMACY" || normalizedMode === "CLINIC_NO_DISPENSE"
          ? 0
          : dispenseQuantity
            ? parseInt(dispenseQuantity, 10)
            : 0;
      const extQty = externalQuantity ? parseInt(externalQuantity, 10) : 0;

      // If dispensing from inventory, check stock and batches first
      let inventoryItem = null;
      if (dispenseQty > 0) {
        if (!inventoryItemId) {
          sendJson(res, 400, {
            message: "Select a matching clinic inventory item before dispensing stock.",
          });
          return;
        }
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

      // Build clean stored instructions with standardized fulfillment directive when external/partial
      const baseInstructions =
        typeof instructions === "string" ? instructions.trim() : "";
      let finalInstructions: string | null = baseInstructions || null;
      if (normalizedMode === "EXTERNAL_PHARMACY") {
        const tag =
          extQty > 0
            ? `[External Pharmacy: Purchase ${extQty} units at an external pharmacy (unavailable in CSU Clinic stock)]`
            : "[External Pharmacy: Not currently available in CSU Clinic stock; purchase at an outside pharmacy]";
        finalInstructions = baseInstructions ? `${baseInstructions} | ${tag}` : tag;
      } else if (normalizedMode === "PARTIAL_EXTERNAL") {
        const tag =
          extQty > 0
            ? `[Partial Clinic Dispense: ${dispenseQty} unit${dispenseQty === 1 ? "" : "s"} dispensed at CSU Clinic; purchase remaining ${extQty} unit${extQty === 1 ? "" : "s"} at an outside pharmacy]`
            : `[Partial Clinic Dispense: ${dispenseQty} unit${dispenseQty === 1 ? "" : "s"} dispensed at CSU Clinic; purchase remaining balance at an outside pharmacy]`;
        finalInstructions = baseInstructions ? `${baseInstructions} | ${tag}` : tag;
      }

      // Create the prescription record
      const prescription = await prisma.prescription.create({
        data: {
          patientId,
          doctorId: user.id,
          name,
          dosage,
          form: typeof form === "string" && form.trim() ? form.trim() : "Tablet",
          frequency,
          instructions: finalInstructions,
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
              reason:
                normalizedMode === "PARTIAL_EXTERNAL"
                  ? `Partial clinic dispense by Dr. ${user.firstName} ${user.lastName} (${dispenseQty} starter units given; balance via external pharmacy)`
                  : `Prescribed & Dispensed by Dr. ${user.firstName} ${user.lastName} (${dispenseQty} units given)`,
            },
          }),
        ]);

        transactionRecord = {
          dispensedUnits: dispenseQty,
          remainingStock: updatedInv.currentStock,
          transactionId: createdTx.id,
        };
      }

      // Optional: notify Admin & Pharmacy Staff to restock / procure an unavailable or depleted drug
      let restockRequested = false;
      if (requestRestock === true) {
        const stockInfo =
          normalizedMode === "PARTIAL_EXTERNAL" && transactionRecord
            ? `Clinic stock depleted to ${transactionRecord.remainingStock} unit(s) after partial dispense.`
            : inventoryItemId
              ? "Currently out of stock (0 units) in CSU Clinic inventory."
              : "Not currently stocked in CSU Clinic formulary.";
        const restockMsg = `Dr. ${user.firstName} ${user.lastName} prescribed ${name} (${dosage}) as an external/partial prescription. ${stockInfo}`;
        await Promise.all([
          createNotification({
            userId: user.id,
            type: "WARNING",
            title: `Restock Request: ${name} (${dosage})`,
            message: restockMsg,
          }),
          prisma.activityLog.create({
            data: {
              adminId: user.id,
              action: "RESTOCK_REQUESTED",
              details: restockMsg,
              targetId: inventoryItemId || prescription.id,
              targetType: inventoryItemId ? "InventoryItem" : "Prescription",
            },
          }),
        ]);
        restockRequested = true;
      }

      sendJson(res, 201, {
        ...prescription,
        fulfillmentMode: normalizedMode,
        dispensed: transactionRecord,
        restockRequested,
      });
      return;
    } catch (err: any) {
      console.error("POST /medications error:", err);
      sendJson(res, 500, { message: err.message || "Failed to create prescription" });
      return;
    }
  }

  // POST /medications/patient-regimen (Sync self-scanned medication / OTC from Mobile OCR)
  if (req.method === "POST" && pathname === "/medications/patient-regimen") {
    try {
      const patientProfile = await prisma.patientProfile.findUnique({
        where: { userId: user.id },
      });

      if (!patientProfile) {
        sendJson(res, 400, { message: "Patient profile not found." });
        return;
      }

      const body = await readJsonBody(req);
      const {
        id,
        name,
        dosage,
        form,
        instructions,
        frequency,
        scheduleTimes,
        startDate,
        endDate,
      } = body;

      if (!name || !dosage) {
        sendJson(res, 400, { message: "Name and dosage are required." });
        return;
      }

      const parsedStart = startDate ? new Date(startDate) : new Date();
      const parsedEnd =
        endDate && !Number.isNaN(new Date(endDate).getTime()) ? new Date(endDate) : null;

      const rx = await prisma.prescription.upsert({
        where: { id: id || `rx_mobile_${Date.now()}` },
        create: {
          id: id || undefined,
          patientId: patientProfile.id,
          name,
          dosage,
          form: form || "Tablet",
          instructions: instructions || "Scanned via Mobile OCR",
          frequency: frequency || "As directed",
          scheduleTimes: scheduleTimes || ["08:00 AM"],
          startDate: Number.isNaN(parsedStart.getTime()) ? new Date() : parsedStart,
          endDate: parsedEnd,
          status: "ACTIVE",
        },
        update: {
          name,
          dosage,
          form: form || "Tablet",
          instructions: instructions || "Scanned via Mobile OCR",
          frequency: frequency || "As directed",
          scheduleTimes: scheduleTimes || ["08:00 AM"],
          ...(parsedEnd !== null ? { endDate: parsedEnd } : {}),
        },
      });

      sendJson(res, 201, {
        message: "Patient regimen synced successfully",
        prescription: rx,
      });
      return;
    } catch (err: any) {
      console.error("POST /medications/patient-regimen error:", err);
      sendJson(res, 500, { message: err.message || "Failed to sync patient regimen" });
      return;
    }
  }

  // PATCH /medications/:id (Update Prescription Lifecycle Status or Regimen Details)
  const patchPrescriptionMatch = pathname.match(/^\/medications\/([^/]+)$/);
  if (req.method === "PATCH" && patchPrescriptionMatch) {
    if (user.role !== "DOCTOR" && user.role !== "ADMIN") {
      sendJson(res, 403, {
        message: "Only licensed doctors can modify or discontinue prescriptions.",
      });
      return;
    }

    const prescriptionId = patchPrescriptionMatch[1];
    if (!prescriptionId) {
      sendJson(res, 400, { message: "Prescription ID is required." });
      return;
    }

    try {
      const existing = await prisma.prescription.findUnique({
        where: { id: prescriptionId },
      });

      if (!existing) {
        sendJson(res, 404, { message: "Prescription not found." });
        return;
      }

      const body = await readJsonBody(req);
      const validStatuses = ["ACTIVE", "PAUSED", "COMPLETED", "DISCONTINUED"] as const;
      const nextStatus =
        typeof body.status === "string" &&
        (validStatuses as readonly string[]).includes(body.status)
          ? (body.status as (typeof validStatuses)[number])
          : undefined;

      const nextEndDate =
        body.endDate !== undefined
          ? body.endDate
            ? new Date(body.endDate)
            : null
          : nextStatus === "COMPLETED" || nextStatus === "DISCONTINUED"
            ? existing.endDate || new Date()
            : undefined;

      const updated = await prisma.prescription.update({
        where: { id: prescriptionId },
        data: {
          ...(nextStatus ? { status: nextStatus } : {}),
          ...(typeof body.dosage === "string" && body.dosage.trim()
            ? { dosage: body.dosage.trim() }
            : {}),
          ...(typeof body.form === "string" && body.form.trim()
            ? { form: body.form.trim() }
            : {}),
          ...(typeof body.frequency === "string" && body.frequency.trim()
            ? { frequency: body.frequency.trim() }
            : {}),
          ...(Array.isArray(body.scheduleTimes) && body.scheduleTimes.length > 0
            ? { scheduleTimes: body.scheduleTimes }
            : {}),
          ...(body.instructions !== undefined
            ? {
                instructions:
                  typeof body.instructions === "string" && body.instructions.trim()
                    ? body.instructions.trim()
                    : null,
              }
            : {}),
          ...(nextEndDate !== undefined ? { endDate: nextEndDate } : {}),
        },
      });

      sendJson(res, 200, updated);
      return;
    } catch (err: any) {
      console.error("PATCH /medications/:id error:", err);
      sendJson(res, 500, { message: err.message || "Failed to update prescription." });
      return;
    }
  }

  // DELETE /medications/:id (Delete/Discontinue Prescription)
  const deletePrescriptionMatch = pathname.match(/^\/medications\/([^/]+)$/);
  if (req.method === "DELETE" && deletePrescriptionMatch) {
    const prescriptionId = deletePrescriptionMatch[1];
    if (!prescriptionId) {
      sendJson(res, 400, { message: "Prescription ID is required" });
      return;
    }

    try {
      const rx = await prisma.prescription.findUnique({
        where: { id: prescriptionId },
      });

      if (!rx) {
        sendJson(res, 404, { message: "Prescription not found" });
        return;
      }

      // If patient, ensure they own this prescription and block deleting doctor-issued clinic prescriptions
      if (user.role === "PATIENT") {
        const patientProfile = await prisma.patientProfile.findUnique({
          where: { userId: user.id },
        });
        if (!patientProfile || rx.patientId !== patientProfile.id) {
          sendJson(res, 403, { message: "You can only remove your own prescriptions" });
          return;
        }
        if (rx.doctorId !== null) {
          sendJson(res, 403, {
            message:
              "Clinic-issued prescriptions cannot be deleted by patients. Contact CSU Health Services if your regimen has changed.",
          });
          return;
        }
      }

      // Delete associated adherence logs first, then prescription
      await prisma.adherenceLog.deleteMany({
        where: { prescriptionId },
      });

      await prisma.prescription.delete({
        where: { id: prescriptionId },
      });

      sendJson(res, 200, { message: "Prescription removed successfully" });
      return;
    } catch (err: any) {
      console.error("DELETE /medications/:id error:", err);
      sendJson(res, 500, { message: err.message || "Failed to remove prescription" });
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

      if (prescription.status !== "ACTIVE") {
        sendJson(res, 400, {
          message: `Cannot dispense medication for a ${prescription.status.toLowerCase()} prescription.`,
        });
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
