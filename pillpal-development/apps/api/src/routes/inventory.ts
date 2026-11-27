import type { IncomingMessage, ServerResponse } from "node:http";
import { prisma, InventoryStatus } from "@pillpal/database";
import { getAuthenticatedUser } from "../services/auth.js";
import { createNotification } from "../services/notifications.js";

const EXPIRY_RECONCILE_THROTTLE_MS = 60_000;
let lastExpiryReconcileAt = 0;

function computeInventoryStatus(
  usableStock: number,
  expiredUnits: number,
  minimumStock: number,
): InventoryStatus {
  if (usableStock <= 0 && expiredUnits > 0) return "EXPIRED";
  if (usableStock <= 0) return "OUT_OF_STOCK";
  if (usableStock <= minimumStock) return "LOW_STOCK";
  return "AVAILABLE";
}

async function reconcileExpiredInventory(force = false): Promise<void> {
  const nowMs = Date.now();
  if (!force && nowMs - lastExpiryReconcileAt < EXPIRY_RECONCILE_THROTTLE_MS) {
    return;
  }
  lastExpiryReconcileAt = nowMs;

  const now = new Date(nowMs);
  const items = await prisma.inventoryItem.findMany({
    include: {
      batches: {
        where: { quantity: { gt: 0 } },
        orderBy: { expiryDate: "asc" },
      },
    },
  });

  const dayAgo = new Date(nowMs - 24 * 60 * 60 * 1000);

  for (const item of items) {
    if (item.batches.length === 0) {
      // No active batch rows — preserve manually audited currentStock, ensure status isn't stale EXPIRED
      const nextStatus = computeInventoryStatus(item.currentStock, 0, item.minimumStock);
      if (item.status !== nextStatus) {
        await prisma.inventoryItem.update({
          where: { id: item.id },
          data: { status: nextStatus },
        });
      }
      continue;
    }

    let usableStock = 0;
    let expiredUnits = 0;
    const expiredBatchNumbers: string[] = [];

    for (const batch of item.batches) {
      if (batch.expiryDate <= now) {
        expiredUnits += batch.quantity;
        expiredBatchNumbers.push(`${batch.batchNumber} (${batch.quantity}u)`);
      } else {
        usableStock += batch.quantity;
      }
    }

    const nextStatus = computeInventoryStatus(usableStock, expiredUnits, item.minimumStock);
    if (item.currentStock !== usableStock || item.status !== nextStatus) {
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: {
          currentStock: usableStock,
          status: nextStatus,
        },
      });
    }

    if (expiredUnits > 0) {
      const notifTitle = `Expired Medicine Quarantined: ${item.name} (${item.strength})`;
      const existingAlert = await prisma.adminNotification.findFirst({
        where: {
          title: notifTitle,
          createdAt: { gte: dayAgo },
        },
      });

      if (!existingAlert) {
        await createNotification({
          type: "ALERT",
          title: notifTitle,
          message: `${expiredUnits} unit${expiredUnits === 1 ? "" : "s"} across lot${expiredBatchNumbers.length === 1 ? "" : "s"} ${expiredBatchNumbers.join(", ")} have expired and are quarantined from dispensing. Pull from shelf and log disposal or supplier return.`,
        });
      }
    }
  }
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

export async function inventoryRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Unauthorized" }));
    return;
  }

  // Doctor, Health Staff, and Admin can view and manage clinic inventory.
  const isClinician =
    user.role === "HEALTH_STAFF" ||
    user.role === "DOCTOR" ||
    user.role === "ADMIN";
  if (!isClinician) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Forbidden: Clinical staff access required" }));
    return;
  }

  const url = new URL(req.url || "/", "http://localhost:4000");
  const pathname = url.pathname;

  // 1. GET /inventory/alerts
  if (req.method === "GET" && pathname === "/inventory/alerts") {
    try {
      await reconcileExpiredInventory();
      const now = new Date();
      const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

      const [lowStockItems, outOfStockItems, expiredBatches, expiringSoonBatches] = await Promise.all([
        prisma.inventoryItem.findMany({
          where: {
            currentStock: { gt: 0 },
            status: "LOW_STOCK",
          },
          orderBy: { currentStock: "asc" },
        }),
        prisma.inventoryItem.findMany({
          where: { currentStock: 0 },
          orderBy: { name: "asc" },
        }),
        prisma.inventoryBatch.findMany({
          where: {
            quantity: { gt: 0 },
            expiryDate: { lte: now },
          },
          include: { inventoryItem: true },
          orderBy: { expiryDate: "asc" },
        }),
        prisma.inventoryBatch.findMany({
          where: {
            quantity: { gt: 0 },
            expiryDate: { gt: now, lte: in60Days },
          },
          include: { inventoryItem: true },
          orderBy: { expiryDate: "asc" },
        }),
      ]);

      const expiredUnitsTotal = expiredBatches.reduce((sum, b) => sum + b.quantity, 0);

      const formatBatchAlert = (b: (typeof expiredBatches)[number], isExpired: boolean) => ({
        id: b.id,
        inventoryItemId: b.inventoryItemId,
        medicationName: `${b.inventoryItem.name} ${b.inventoryItem.strength}`,
        genericName: b.inventoryItem.name,
        strength: b.inventoryItem.strength,
        form: b.inventoryItem.form,
        batchNumber: b.batchNumber,
        quantity: b.quantity,
        expiryDate: b.expiryDate.toISOString(),
        supplier: b.supplier,
        isExpired,
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          lowStockCount: lowStockItems.length,
          outOfStockCount: outOfStockItems.length,
          expiredCount: expiredBatches.length,
          expiredUnitsTotal,
          expiringSoonCount: expiringSoonBatches.length,
          lowStockItems,
          outOfStockItems,
          expiredBatches: expiredBatches.map((b) => formatBatchAlert(b, true)),
          expiringBatches: expiringSoonBatches.map((b) => formatBatchAlert(b, false)),
        }),
      );
      return;
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: err.message || "Failed to fetch inventory alerts" }));
      return;
    }
  }

  // 2. GET /inventory/history (Transaction Ledger)
  if (req.method === "GET" && pathname === "/inventory/history") {
    try {
      const transactions = await prisma.inventoryTransaction.findMany({
        take: 100,
        orderBy: { createdAt: "desc" },
        include: {
          inventoryItem: true,
          performedBy: {
            select: { firstName: true, lastName: true, role: true },
          },
        },
      });

      const formatted = transactions.map((t) => ({
        id: t.id,
        medicationName: `${t.inventoryItem.name} ${t.inventoryItem.strength}`,
        form: t.inventoryItem.form,
        type: t.type,
        quantity: t.quantity,
        previousStock: t.previousStock,
        newStock: t.newStock,
        batchNumber: t.batchNumber,
        reason: t.reason,
        performedBy: `${t.performedBy.firstName} ${t.performedBy.lastName} (${t.performedBy.role})`,
        createdAt: t.createdAt.toISOString(),
      }));

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(formatted));
      return;
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: err.message || "Failed to fetch inventory history" }));
      return;
    }
  }

  // 3. GET /inventory (Stock Catalog)
  if (req.method === "GET" && pathname === "/inventory") {
    try {
      await reconcileExpiredInventory();
      const now = new Date();
      const search = url.searchParams.get("q")?.toLowerCase().trim();
      const categoryFilter = url.searchParams.get("category");
      const statusFilter = url.searchParams.get("status") as any;

      const items = await prisma.inventoryItem.findMany({
        where: {
          AND: [
            categoryFilter ? { category: categoryFilter } : {},
            statusFilter ? { status: statusFilter } : {},
            search
              ? {
                  OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { brandName: { contains: search, mode: "insensitive" } },
                    { category: { contains: search, mode: "insensitive" } },
                  ],
                }
              : {},
          ],
        },
        include: {
          batches: {
            where: { quantity: { gt: 0 } },
            orderBy: { expiryDate: "asc" },
          },
        },
        orderBy: { name: "asc" },
      });

      const formatted = items.map((i) => {
        const usableBatches = i.batches.filter((b) => b.expiryDate > now);
        const expiredBatches = i.batches.filter((b) => b.expiryDate <= now);
        const expiredUnits = expiredBatches.reduce((sum, b) => sum + b.quantity, 0);
        const nextExpiringBatch = usableBatches[0] ?? i.batches[0];
        return {
          id: i.id,
          name: i.name,
          brandName: i.brandName || "Generic",
          strength: i.strength,
          form: i.form,
          category: i.category,
          currentStock: i.currentStock,
          expiredUnits,
          expiredBatchesCount: expiredBatches.length,
          minimumStock: i.minimumStock,
          status: i.status,
          activeBatchesCount: usableBatches.length,
          closestExpiryDate: nextExpiringBatch
            ? nextExpiringBatch.expiryDate.toISOString()
            : null,
          batches: i.batches.map((b) => ({
            id: b.id,
            batchNumber: b.batchNumber,
            quantity: b.quantity,
            expiryDate: b.expiryDate.toISOString(),
            supplier: b.supplier,
            isExpired: b.expiryDate <= now,
          })),
        };
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(formatted));
      return;
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: err.message || "Failed to fetch inventory" }));
      return;
    }
  }

  // 4b. POST /inventory/restock-request (Clinician request to restock or procure unavailable medication)
  if (req.method === "POST" && pathname === "/inventory/restock-request") {
    try {
      const body = await readJsonBody(req);
      const medicationName =
        typeof body.medicationName === "string" ? body.medicationName.trim() : "";
      const dosage = typeof body.dosage === "string" ? body.dosage.trim() : "";
      const form = typeof body.form === "string" ? body.form.trim() : "";
      const inventoryItemId =
        typeof body.inventoryItemId === "string" && body.inventoryItemId.trim()
          ? body.inventoryItemId.trim()
          : null;
      const urgency = body.urgency === "URGENT" ? "URGENT" : "ROUTINE";
      const notes = typeof body.notes === "string" ? body.notes.trim() : "";

      if (!medicationName) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Medication name is required for a restock request." }));
        return;
      }

      const existingItem = inventoryItemId
        ? await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } })
        : null;

      const medLabel = [medicationName, dosage, form].filter(Boolean).join(" ");
      const requesterName =
        user.role === "DOCTOR"
          ? `Dr. ${user.firstName} ${user.lastName}`.trim()
          : `${user.firstName} ${user.lastName}`.trim();
      const stockContext = existingItem
        ? `Currently ${existingItem.currentStock} unit${existingItem.currentStock === 1 ? "" : "s"} in CSU Clinic inventory (${existingItem.status}).`
        : "Not currently listed in CSU Clinic formulary / inventory.";

      const message = `${requesterName} requested restock/procurement for ${medLabel}. ${stockContext}${notes ? ` Note: ${notes}` : ""}`;

      const [notification] = await Promise.all([
        createNotification({
          userId: user.id,
          type: urgency === "URGENT" ? "ALERT" : "WARNING",
          title: `${urgency === "URGENT" ? "Urgent " : ""}Restock Request: ${medicationName}${dosage ? ` (${dosage})` : ""}`,
          message,
        }),
        prisma.activityLog.create({
          data: {
            adminId: user.id,
            action: "RESTOCK_REQUESTED",
            details: message,
            targetId: existingItem?.id ?? null,
            targetType: "InventoryItem",
          },
        }),
      ]);

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          message: `Restock alert sent to Admin & Pharmacy Staff for ${medLabel}.`,
          notificationId: notification?.id ?? null,
        }),
      );
      return;
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: err.message || "Failed to submit restock request." }));
      return;
    }
  }

  // 4. POST /inventory (Create Catalog Item)
  if (req.method === "POST" && pathname === "/inventory") {
    if (user.role !== "HEALTH_STAFF" && user.role !== "DOCTOR" && user.role !== "ADMIN") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Only clinical staff can add inventory items" }));
      return;
    }

    try {
      const body = await readJsonBody(req);
      const { name, brandName, strength, form, category, minimumStock } = body;

      if (!name || !strength || !form || !category) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Name, strength, form, and category are required" }));
        return;
      }

      const item = await prisma.inventoryItem.create({
        data: {
          name,
          brandName: brandName || null,
          strength,
          form,
          category,
          minimumStock: minimumStock ? parseInt(minimumStock, 10) : 20,
          currentStock: 0,
          status: "OUT_OF_STOCK",
        },
      });

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(item));
      return;
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: err.message || "Failed to create inventory item" }));
      return;
    }
  }

  // 5. POST /inventory/:id/receive (Receive Supply Batch)
  const receiveMatch = pathname.match(/^\/inventory\/([^/]+)\/receive$/);
  if (req.method === "POST" && receiveMatch) {
    if (user.role !== "HEALTH_STAFF" && user.role !== "DOCTOR" && user.role !== "ADMIN") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Only clinical staff can receive inventory shipments" }));
      return;
    }

    const itemId = receiveMatch[1];
    try {
      const body = await readJsonBody(req);
      const { batchNumber, quantity, expiryDate, supplier, reason } = body;

      const qty = parseInt(quantity, 10);
      const parsedExpiry = expiryDate ? new Date(expiryDate) : new Date(NaN);
      const now = new Date();
      if (!itemId || !batchNumber || !qty || qty <= 0 || Number.isNaN(parsedExpiry.getTime())) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "Valid batch number, positive quantity, and expiry date are required",
          }),
        );
        return;
      }

      if (parsedExpiry <= now) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message:
              "Cannot receive already-expired medication. Expiry date must be in the future.",
          }),
        );
        return;
      }

      const item = await prisma.inventoryItem.findUnique({
        where: { id: itemId },
        include: {
          batches: {
            where: { quantity: { gt: 0 } },
          },
        },
      });
      if (!item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Inventory item not found" }));
        return;
      }

      const expiredUnits = item.batches
        .filter((b) => b.expiryDate <= now)
        .reduce((sum, b) => sum + b.quantity, 0);
      const existingUsable =
        item.batches.length > 0
          ? item.batches
              .filter((b) => b.expiryDate > now)
              .reduce((sum, b) => sum + b.quantity, 0)
          : item.currentStock;

      const previousStock = existingUsable;
      const newStock = previousStock + qty;
      const newStatus = computeInventoryStatus(newStock, expiredUnits, item.minimumStock);

      const [updatedItem, batch, transaction] = await prisma.$transaction([
        prisma.inventoryItem.update({
          where: { id: itemId },
          data: {
            currentStock: newStock,
            status: newStatus,
          },
        }),
        prisma.inventoryBatch.create({
          data: {
            inventoryItemId: itemId,
            batchNumber: String(batchNumber).trim(),
            quantity: qty,
            expiryDate: parsedExpiry,
            supplier: supplier || null,
          },
        }),
        prisma.inventoryTransaction.create({
          data: {
            inventoryItemId: itemId,
            type: "RECEIVED",
            quantity: qty,
            previousStock,
            newStock,
            batchNumber: String(batchNumber).trim(),
            performedById: user.id,
            reason: reason || `Received supply shipment (Lot ${batchNumber})`,
          },
        }),
      ]);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ item: updatedItem, batch, transaction }));
      return;
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: err.message || "Failed to receive supply" }));
      return;
    }
  }

  // 6. POST /inventory/:id/dispense (Dispense Stock - FEFO)
  const dispenseMatch = pathname.match(/^\/inventory\/([^/]+)\/dispense$/);
  if (req.method === "POST" && dispenseMatch) {
    if (user.role !== "HEALTH_STAFF" && user.role !== "ADMIN" && user.role !== "DOCTOR") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Only Health Staff, Doctors, and Administrators can dispense medications" }));
      return;
    }

    const itemId = dispenseMatch[1];
    try {
      const body = await readJsonBody(req);
      const { quantity, type, patientId, prescriptionId, reason } = body;

      const qty = parseInt(quantity, 10);
      if (!itemId || !qty || qty <= 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Valid positive quantity is required" }));
        return;
      }

      const now = new Date();
      const item = await prisma.inventoryItem.findUnique({
        where: { id: itemId },
        include: {
          batches: {
            where: { quantity: { gt: 0 } },
            orderBy: { expiryDate: "asc" }, // FEFO order
          },
        },
      });

      if (!item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Inventory item not found" }));
        return;
      }

      const usableBatches = item.batches.filter((b) => b.expiryDate > now);
      const expiredBatches = item.batches.filter((b) => b.expiryDate <= now);
      const expiredUnits = expiredBatches.reduce((sum, b) => sum + b.quantity, 0);
      const usableStock =
        item.batches.length > 0
          ? usableBatches.reduce((sum, b) => sum + b.quantity, 0)
          : item.currentStock;

      if (usableStock < qty) {
        // Keep stored currentStock/status synchronized with quarantined expiry state
        const syncedStatus = computeInventoryStatus(usableStock, expiredUnits, item.minimumStock);
        if (item.currentStock !== usableStock || item.status !== syncedStatus) {
          await prisma.inventoryItem.update({
            where: { id: itemId },
            data: { currentStock: usableStock, status: syncedStatus },
          });
        }

        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message:
              expiredUnits > 0
                ? `Cannot dispense expired stock. Usable non-expired stock: ${usableStock} unit${usableStock === 1 ? "" : "s"} (${expiredUnits} expired unit${expiredUnits === 1 ? "" : "s"} quarantined pending disposal).`
                : `Insufficient stock. Current available: ${usableStock}, requested: ${qty}`,
          }),
        );
        return;
      }

      const previousStock = usableStock;
      const newStock = previousStock - qty;
      const newStatus = computeInventoryStatus(newStock, expiredUnits, item.minimumStock);

      // Deduct strictly from non-expired batches via FEFO
      let remainingToDeduct = qty;
      const batchUpdates = [];
      const deductedBatchNumbers: string[] = [];
      for (const b of usableBatches) {
        if (remainingToDeduct <= 0) break;
        const deductFromBatch = Math.min(b.quantity, remainingToDeduct);
        batchUpdates.push(
          prisma.inventoryBatch.update({
            where: { id: b.id },
            data: { quantity: b.quantity - deductFromBatch },
          }),
        );
        deductedBatchNumbers.push(b.batchNumber);
        remainingToDeduct -= deductFromBatch;
      }

      const [updatedItem, transaction] = await prisma.$transaction([
        prisma.inventoryItem.update({
          where: { id: itemId },
          data: {
            currentStock: newStock,
            status: newStatus,
          },
        }),
        ...batchUpdates,
        prisma.inventoryTransaction.create({
          data: {
            inventoryItemId: itemId,
            type: type === "DISPENSED_RX" ? "DISPENSED_RX" : "DISPENSED_OTC",
            quantity: -qty,
            previousStock,
            newStock,
            batchNumber: deductedBatchNumbers.length > 0 ? deductedBatchNumbers.join(", ") : null,
            patientId: patientId || null,
            prescriptionId: prescriptionId || null,
            performedById: user.id,
            reason: reason || (type === "DISPENSED_RX" ? "Prescription Dispensed" : "Walk-in OTC Clinic Care"),
          },
        }),
      ]);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ item: updatedItem, transaction }));
      return;
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: err.message || "Failed to dispense medication" }));
      return;
    }
  }

  // 6b. POST /inventory/batches/:batchId/dispose (Dispose Expired/Damaged or Return to Supplier)
  const disposeMatch = pathname.match(/^\/inventory\/batches\/([^/]+)\/dispose$/);
  if (req.method === "POST" && disposeMatch) {
    if (user.role !== "HEALTH_STAFF" && user.role !== "DOCTOR" && user.role !== "ADMIN") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ message: "Only clinical staff can dispose or return inventory batches" }),
      );
      return;
    }

    const batchId = disposeMatch[1];
    if (!batchId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Valid batch ID is required." }));
      return;
    }
    try {
      const body = await readJsonBody(req);
      const action = body.action === "RETURN_SUPPLIER" ? "RETURN_SUPPLIER" : "DISPOSE";
      const disposalMethod =
        typeof body.disposalMethod === "string" ? body.disposalMethod.trim() : "";
      const witnessName = typeof body.witnessName === "string" ? body.witnessName.trim() : "";
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";

      if (!reason) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "A mandatory audit reason is required." }));
        return;
      }

      const batch = await prisma.inventoryBatch.findUnique({
        where: { id: batchId },
        include: {
          inventoryItem: {
            include: {
              batches: {
                where: { quantity: { gt: 0 } },
              },
            },
          },
        },
      });

      if (!batch || batch.quantity <= 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Active batch not found or already cleared." }));
        return;
      }

      const requestedQty =
        body.quantity !== undefined && body.quantity !== ""
          ? parseInt(String(body.quantity), 10)
          : batch.quantity;

      if (Number.isNaN(requestedQty) || requestedQty <= 0 || requestedQty > batch.quantity) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: `Quantity must be between 1 and ${batch.quantity} units for lot ${batch.batchNumber}.`,
          }),
        );
        return;
      }

      const now = new Date();
      const item = batch.inventoryItem;
      const isBatchExpired = batch.expiryDate <= now;
      const remainingBatchQty = batch.quantity - requestedQty;

      // Recalculate usable vs expired stock before & after removal
      let usableBefore = 0;
      let expiredBefore = 0;
      for (const b of item.batches) {
        if (b.expiryDate <= now) expiredBefore += b.quantity;
        else usableBefore += b.quantity;
      }

      const usableAfter = isBatchExpired ? usableBefore : Math.max(0, usableBefore - requestedQty);
      const expiredAfter = isBatchExpired
        ? Math.max(0, expiredBefore - requestedQty)
        : expiredBefore;
      const nextStatus = computeInventoryStatus(usableAfter, expiredAfter, item.minimumStock);

      const txType = action === "RETURN_SUPPLIER" ? "RETURNED" : "DAMAGED_EXPIRED";
      const reasonParts = [
        action === "RETURN_SUPPLIER" ? "Returned to Supplier" : isBatchExpired ? "Expired Stock Disposed" : "Damaged Stock Disposed",
        reason,
        disposalMethod ? `Method: ${disposalMethod}` : null,
        witnessName ? `Witness: ${witnessName}` : null,
      ].filter(Boolean);
      const formattedReason = reasonParts.join(" • ");

      const [updatedBatch, updatedItem, transaction] = await prisma.$transaction([
        prisma.inventoryBatch.update({
          where: { id: batch.id },
          data: { quantity: remainingBatchQty },
        }),
        prisma.inventoryItem.update({
          where: { id: item.id },
          data: {
            currentStock: usableAfter,
            status: nextStatus,
          },
        }),
        prisma.inventoryTransaction.create({
          data: {
            inventoryItemId: item.id,
            type: txType,
            quantity: -requestedQty,
            previousStock: usableBefore,
            newStock: usableAfter,
            batchNumber: batch.batchNumber,
            performedById: user.id,
            reason: formattedReason,
          },
        }),
        prisma.activityLog.create({
          data: {
            adminId: user.id,
            action:
              action === "RETURN_SUPPLIER"
                ? "INVENTORY_BATCH_RETURNED"
                : "INVENTORY_BATCH_DISPOSED",
            details: `${requestedQty}u of ${item.name} ${item.strength} (Lot ${batch.batchNumber}) — ${formattedReason}`,
            targetId: item.id,
            targetType: "InventoryItem",
          },
        }),
      ]);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          message:
            action === "RETURN_SUPPLIER"
              ? `Logged supplier return for ${requestedQty} units of Lot ${batch.batchNumber}.`
              : `Logged disposal for ${requestedQty} units of Lot ${batch.batchNumber}.`,
          item: updatedItem,
          batch: updatedBatch,
          transaction,
        }),
      );
      return;
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: err.message || "Failed to process batch disposal" }));
      return;
    }
  }

  // 7. POST /inventory/:id/adjust (Audit Count Adjustment)
  const adjustMatch = pathname.match(/^\/inventory\/([^/]+)\/adjust$/);
  if (req.method === "POST" && adjustMatch) {
    if (user.role !== "HEALTH_STAFF" && user.role !== "DOCTOR" && user.role !== "ADMIN") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Only clinical staff can adjust inventory records" }));
      return;
    }

    const itemId = adjustMatch[1];
    try {
      const body = await readJsonBody(req);
      const { newStock: newStockInput, reason } = body;

      const newStock = parseInt(newStockInput, 10);
      if (!itemId || isNaN(newStock) || newStock < 0 || !reason?.trim()) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "Valid non-negative stock number and a mandatory reason note are required",
          }),
        );
        return;
      }

      const now = new Date();
      const item = await prisma.inventoryItem.findUnique({
        where: { id: itemId },
        include: {
          batches: {
            where: { quantity: { gt: 0 }, expiryDate: { lte: now } },
          },
        },
      });
      if (!item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Inventory item not found" }));
        return;
      }

      const expiredUnits = item.batches.reduce((sum, b) => sum + b.quantity, 0);
      const previousStock = item.currentStock;
      const difference = newStock - previousStock;
      const newStatus = computeInventoryStatus(newStock, expiredUnits, item.minimumStock);

      const [updatedItem, transaction] = await prisma.$transaction([
        prisma.inventoryItem.update({
          where: { id: itemId },
          data: {
            currentStock: newStock,
            status: newStatus,
          },
        }),
        prisma.inventoryTransaction.create({
          data: {
            inventoryItemId: itemId,
            type: "ADJUSTED_AUDIT",
            quantity: difference,
            previousStock,
            newStock,
            performedById: user.id,
            reason: reason.trim(),
          },
        }),
      ]);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ item: updatedItem, transaction }));
      return;
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: err.message || "Failed to adjust inventory" }));
      return;
    }
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ message: "Method not allowed" }));
}
