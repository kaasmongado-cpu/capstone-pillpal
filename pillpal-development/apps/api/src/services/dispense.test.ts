import { describe, it } from "node:test";
import assert from "node:assert/strict";

export function canUserDispenseMedications(role: string): boolean {
  return role === "DOCTOR" || role === "HEALTH_STAFF" || role === "ADMIN";
}

export function calculateNewInventoryStatus(
  currentStock: number,
  minimumStock: number,
): "AVAILABLE" | "LOW_STOCK" | "OUT_OF_STOCK" {
  if (currentStock <= 0) return "OUT_OF_STOCK";
  if (currentStock <= minimumStock) return "LOW_STOCK";
  return "AVAILABLE";
}

export function simulateFefoDeduction(
  batches: Array<{ id: string; quantity: number; expiryDate: string }>,
  quantityToDispense: number,
) {
  // Sort batches by expiry date ascending (FEFO)
  const sortedBatches = [...batches].sort(
    (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
  );

  let remainingToDeduct = quantityToDispense;
  const updatedBatches: Array<{ id: string; originalQty: number; deductedQty: number; remainingQty: number }> = [];

  for (const b of sortedBatches) {
    if (remainingToDeduct <= 0) {
      updatedBatches.push({
        id: b.id,
        originalQty: b.quantity,
        deductedQty: 0,
        remainingQty: b.quantity,
      });
      continue;
    }

    const deduct = Math.min(b.quantity, remainingToDeduct);
    remainingToDeduct -= deduct;
    updatedBatches.push({
      id: b.id,
      originalQty: b.quantity,
      deductedQty: deduct,
      remainingQty: b.quantity - deduct,
    });
  }

  return {
    fulfilled: remainingToDeduct === 0,
    unfulfilledQty: remainingToDeduct,
    updatedBatches,
  };
}

describe("Medication Dispensing & Clinical Inventory Logic", () => {
  it("authorizes DOCTOR, HEALTH_STAFF, and ADMIN to dispense medications", () => {
    assert.equal(canUserDispenseMedications("DOCTOR"), true);
    assert.equal(canUserDispenseMedications("HEALTH_STAFF"), true);
    assert.equal(canUserDispenseMedications("ADMIN"), true);
    assert.equal(canUserDispenseMedications("PATIENT"), false);
    assert.equal(canUserDispenseMedications("GUEST"), false);
  });

  it("calculates correct inventory status based on stock thresholds", () => {
    assert.equal(calculateNewInventoryStatus(0, 10), "OUT_OF_STOCK");
    assert.equal(calculateNewInventoryStatus(-5, 10), "OUT_OF_STOCK");
    assert.equal(calculateNewInventoryStatus(5, 10), "LOW_STOCK");
    assert.equal(calculateNewInventoryStatus(10, 10), "LOW_STOCK");
    assert.equal(calculateNewInventoryStatus(11, 10), "AVAILABLE");
    assert.equal(calculateNewInventoryStatus(100, 10), "AVAILABLE");
  });

  it("deducts stock from batches using strict FEFO (First-Expired, First-Out) principle", () => {
    const batches = [
      { id: "batch-nov", quantity: 30, expiryDate: "2026-11-01" }, // later expiry
      { id: "batch-oct", quantity: 10, expiryDate: "2026-10-15" }, // earlier expiry
    ];

    // Request to dispense 15 units
    const result = simulateFefoDeduction(batches, 15);

    assert.equal(result.fulfilled, true);
    assert.equal(result.unfulfilledQty, 0);

    // Oldest batch (batch-oct) should be depleted first (10 deducted, 0 remaining)
    const octBatch = result.updatedBatches.find((b) => b.id === "batch-oct");
    assert.equal(octBatch?.deductedQty, 10);
    assert.equal(octBatch?.remainingQty, 0);

    // Newer batch (batch-nov) should cover the remaining 5 units (5 deducted, 25 remaining)
    const novBatch = result.updatedBatches.find((b) => b.id === "batch-nov");
    assert.equal(novBatch?.deductedQty, 5);
    assert.equal(novBatch?.remainingQty, 25);
  });
});
