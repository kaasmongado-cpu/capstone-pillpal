import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { prisma } from "@pillpal/database";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

async function seedInventory() {
  console.log("📦 Seeding CSU Clinic Medication Inventory...");

  // Find a Health Staff or Admin user to attribute transaction logs
  let staff = await prisma.user.findFirst({
    where: { role: { in: ["HEALTH_STAFF", "ADMIN", "DOCTOR"] } },
  });

  if (!staff) {
    console.error("❌ No staff/admin found to attribute inventory transactions.");
    return;
  }

  const inventoryItems = [
    {
      name: "Amoxicillin",
      brandName: "Amoxil",
      strength: "500 mg",
      form: "Capsule",
      category: "Antibiotics",
      minimumStock: 30,
      currentStock: 120,
      status: "AVAILABLE" as const,
      batches: [
        {
          batchNumber: "LOT-2026-AMX01",
          quantity: 120,
          expiryMonths: 14,
          supplier: "DOH Regional Medical Depot",
        },
      ],
    },
    {
      name: "Paracetamol",
      brandName: "Biogesic",
      strength: "500 mg",
      form: "Tablet",
      category: "Analgesics & Antipyretics",
      minimumStock: 50,
      currentStock: 250,
      status: "AVAILABLE" as const,
      batches: [
        {
          batchNumber: "LOT-2026-PCM01",
          quantity: 250,
          expiryMonths: 18,
          supplier: "Mercury Drug Wholesale",
        },
      ],
    },
    {
      name: "Metformin Hydrochloride",
      brandName: "Glucophage",
      strength: "500 mg",
      form: "Tablet",
      category: "Antidiabetics",
      minimumStock: 25,
      currentStock: 80,
      status: "AVAILABLE" as const,
      batches: [
        {
          batchNumber: "LOT-2026-MET01",
          quantity: 80,
          expiryMonths: 12,
          supplier: "Unilab Institutional Sales",
        },
      ],
    },
    {
      name: "Amlodipine Besylate",
      brandName: "Norvasc",
      strength: "10 mg",
      form: "Tablet",
      category: "Antihypertensives",
      minimumStock: 20,
      currentStock: 65,
      status: "AVAILABLE" as const,
      batches: [
        {
          batchNumber: "LOT-2026-AML01",
          quantity: 65,
          expiryMonths: 16,
          supplier: "Pfizer Institutional Supply",
        },
      ],
    },
    {
      name: "Salbutamol Inhaler",
      brandName: "Ventolin",
      strength: "100 mcg",
      form: "Inhaler",
      category: "Respiratory",
      minimumStock: 15,
      currentStock: 8, // Low Stock Alert
      status: "LOW_STOCK" as const,
      batches: [
        {
          batchNumber: "LOT-2026-SLB01",
          quantity: 8,
          expiryMonths: 8,
          supplier: "GSK Philippines",
        },
      ],
    },
    {
      name: "Cetirizine Hydrochloride",
      brandName: "Alnix",
      strength: "10 mg",
      form: "Tablet",
      category: "Antihistamines",
      minimumStock: 20,
      currentStock: 45,
      status: "AVAILABLE" as const,
      batches: [
        {
          batchNumber: "LOT-2025-CTZ99",
          quantity: 45,
          expiryMonths: 1, // Expiring Soon Alert (< 60 days)
          supplier: "Unilab Institutional Sales",
        },
      ],
    },
    {
      name: "Oral Rehydration Salts",
      brandName: "Hydrite",
      strength: "20.5 g",
      form: "Sachet",
      category: "Gastrointestinal & Electrolytes",
      minimumStock: 30,
      currentStock: 0, // Out of Stock Alert
      status: "OUT_OF_STOCK" as const,
      batches: [],
    },
    {
      name: "Ibuprofen",
      brandName: "Advil",
      strength: "200 mg",
      form: "Softgel",
      category: "NSAIDs / Anti-inflammatory",
      minimumStock: 25,
      currentStock: 90,
      status: "AVAILABLE" as const,
      batches: [
        {
          batchNumber: "LOT-2026-IBU01",
          quantity: 90,
          expiryMonths: 20,
          supplier: "Haleon Consumer Health",
        },
      ],
    },
  ];

  for (const item of inventoryItems) {
    const existing = await prisma.inventoryItem.findFirst({
      where: { name: item.name },
    });

    if (!existing) {
      const createdItem = await prisma.inventoryItem.create({
        data: {
          name: item.name,
          brandName: item.brandName,
          strength: item.strength,
          form: item.form,
          category: item.category,
          minimumStock: item.minimumStock,
          currentStock: item.currentStock,
          status: item.status,
        },
      });

      console.log(`✓ Seeded medication: ${item.name} (${item.strength})`);

      for (const batch of item.batches) {
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + batch.expiryMonths);

        await prisma.inventoryBatch.create({
          data: {
            inventoryItemId: createdItem.id,
            batchNumber: batch.batchNumber,
            quantity: batch.quantity,
            expiryDate,
            supplier: batch.supplier,
          },
        });

        // Record initial intake transaction
        await prisma.inventoryTransaction.create({
          data: {
            inventoryItemId: createdItem.id,
            type: "RECEIVED",
            quantity: batch.quantity,
            previousStock: 0,
            newStock: batch.quantity,
            batchNumber: batch.batchNumber,
            performedById: staff.id,
            reason: `Initial stock intake (${batch.supplier})`,
          },
        });
      }
    }
  }

  console.log("🎉 Medication inventory seeded successfully!");
}

seedInventory()
  .catch((e) => {
    console.error("❌ Inventory seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
