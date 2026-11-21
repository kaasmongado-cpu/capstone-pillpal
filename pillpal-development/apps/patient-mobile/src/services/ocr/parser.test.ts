import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseMedicationText } from "./parser.js";

describe("Medication OCR Offline Parser", () => {
  it("should extract generic name, strength, and TID frequency from a prescription slip", () => {
    const raw = "CSU Health Infirmary. Rx: Amoxicillin 500mg capsule. Sig: 1 cap TID pc for 7 days. Dr. Ramirez";
    const result = parseMedicationText(raw);

    assert.equal(result.genericName, "Amoxicillin");
    assert.equal(result.dosage, "500 mg");
    assert.equal(result.form, "Capsule");
    assert.equal(result.frequency, "Three times daily");
    assert.deepEqual(result.scheduleTimes, ["08:00 AM", "02:00 PM", "08:00 PM"]);
    assert.ok(result.confidenceScore >= 0.8);
  });

  it("should autocorrect OCR camera glare typos via fuzzy string matching", () => {
    // Note the OCR errors: 0 instead of O, 1 instead of I
    const raw = "AM0XIC1LLIN 500mg caps";
    const result = parseMedicationText(raw);

    assert.equal(result.genericName, "Amoxicillin");
    assert.equal(result.dosage, "500 mg");
    assert.ok(result.confidenceScore >= 0.7);
  });

  it("should identify brand names and link to generic counterparts", () => {
    const raw = "BIOGESIC 500 mg Tablet. Relief of minor aches and fever.";
    const result = parseMedicationText(raw);

    assert.equal(result.genericName, "Paracetamol");
    assert.equal(result.brandName, "Biogesic");
    assert.equal(result.dosage, "500 mg");
    assert.equal(result.form, "Tablet");
  });

  it("should parse bedtime antihistamine dosing instructions", () => {
    const raw = "Cetirizine 10mg tablet. Take 1 tab at bedtime (HS) for allergy relief.";
    const result = parseMedicationText(raw);

    assert.equal(result.genericName, "Cetirizine");
    assert.equal(result.dosage, "10 mg");
    assert.equal(result.frequency, "Once daily at bedtime");
    assert.deepEqual(result.scheduleTimes, ["09:00 PM"]);
  });

  it("should parse PRN as-needed pain relief prescriptions", () => {
    const raw = "Mefenamic Acid 500mg. Take 1 cap prn for toothache or pain.";
    const result = parseMedicationText(raw);

    assert.equal(result.genericName, "Mefenamic Acid");
    assert.equal(result.dosage, "500 mg");
    assert.equal(result.frequency, "Three times daily after meals");
  });
});

