import type { IncomingMessage, ServerResponse } from "node:http";
import { prisma } from "@pillpal/database";
import { supabase } from "@pillpal/auth";

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

  // Doctor, Health Staff, and Admin can view. Only Health Staff & Admin can perform stock modifications.
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
      const now = new Date();
      const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

      const [lowStockItems, outOfStockItems, expiringBatches] = await Promise.all([
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
            expiryDate: { lte: in60Days },
          },
          include: { inventoryItem: true },
          orderBy: { expiryDate: "asc" },
        }),
      ]);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          lowStockCount: lowStockItems.length,
          outOfStockCount: outOfStockItems.length,
          expiringSoonCount: expiringBatches.length,
          lowStockItems,
          outOfStockItems,
          expiringBatches: expiringBatches.map((b) => ({
            id: b.id,
            medicationName: `${b.inventoryItem.name} ${b.inventoryItem.strength}`,
            batchNumber: b.batchNumber,
            quantity: b.quantity,
            expiryDate: b.expiryDate.toISOString(),
            isExpired: b.expiryDate < now,
          })),
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
        const nextExpiringBatch = i.batches[0];
        return {
          id: i.id,
          name: i.name,
          brandName: i.brandName || "Generic",
          strength: i.strength,
          form: i.form,
          category: i.category,
          currentStock: i.currentStock,
          minimumStock: i.minimumStock,
          status: i.status,
          activeBatchesCount: i.batches.length,
          closestExpiryDate: nextExpiringBatch
            ? nextExpiringBatch.expiryDate.toISOString()
            : null,
          batches: i.batches.map((b) => ({
            id: b.id,
            batchNumber: b.batchNumber,
            quantity: b.quantity,
            expiryDate: b.expiryDate.toISOString(),
            supplier: b.supplier,
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

  // 4. POST /inventory (Create Catalog Item)
  if (req.method === "POST" && pathname === "/inventory") {
    if (user.role !== "HEALTH_STAFF" && user.role !== "ADMIN") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Only Health Staff can add inventory items" }));
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
    if (user.role !== "HEALTH_STAFF" && user.role !== "ADMIN") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Only Health Staff can receive inventory shipments" }));
      return;
    }

    const itemId = receiveMatch[1];
    try {
      const body = await readJsonBody(req);
      const { batchNumber, quantity, expiryDate, supplier, reason } = body;

      const qty = parseInt(quantity, 10);
      if (!itemId || !batchNumber || !qty || qty <= 0 || !expiryDate) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "Valid batch number, positive quantity, and expiry date are required",
          }),
        );
        return;
      }

      const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
      if (!item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Inventory item not found" }));
        return;
      }

      const previousStock = item.currentStock;
      const newStock = previousStock + qty;
      const newStatus =
        newStock <= 0
          ? "OUT_OF_STOCK"
          : newStock <= item.minimumStock
            ? "LOW_STOCK"
            : "AVAILABLE";

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
            batchNumber,
            quantity: qty,
            expiryDate: new Date(expiryDate),
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
            batchNumber,
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

      if (item.currentStock < qty) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: `Insufficient stock. Current available: ${item.currentStock}, requested: ${qty}`,
          }),
        );
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

      // Deduct from batches via FEFO
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

  // 7. POST /inventory/:id/adjust (Audit Count Adjustment)
  const adjustMatch = pathname.match(/^\/inventory\/([^/]+)\/adjust$/);
  if (req.method === "POST" && adjustMatch) {
    if (user.role !== "HEALTH_STAFF" && user.role !== "ADMIN") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Only Health Staff can adjust inventory records" }));
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

      const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
      if (!item) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Inventory item not found" }));
        return;
      }

      const previousStock = item.currentStock;
      const difference = newStock - previousStock;
      const newStatus =
        newStock === 0
          ? "OUT_OF_STOCK"
          : newStock <= item.minimumStock
            ? "LOW_STOCK"
            : "AVAILABLE";

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
