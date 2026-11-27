import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  lookupMedicationPurpose,
  parseMedicationText,
  parseMultipleMedications,
} from "./parser.js";

describe("Medication OCR Offline Parser", () => {
  it("should extract generic name, strength, TID frequency, and 7-day duration from a prescription slip", () => {
    const raw = "CSU Health Infirmary. Rx: Amoxicillin 500mg capsule. Sig: 1 cap TID pc for 7 days. Dr. Ramirez";
    const result = parseMedicationText(raw);

    assert.equal(result.genericName, "Amoxicillin");
    assert.equal(result.dosage, "500 mg");
    assert.equal(result.form, "Capsule");
    assert.equal(result.frequency, "Three times daily");
    assert.deepEqual(result.scheduleTimes, ["08:00 AM", "02:00 PM", "08:00 PM"]);
    assert.equal(result.durationDays, 7);
    assert.ok(result.confidenceScore >= 0.8);
  });

  it("should autocorrect OCR camera glare typos via fuzzy string matching", () => {
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

  it("should NEVER fabricate 500 mg when no dosage strength is visible", () => {
    const raw = "Salbutamol Inhaler 2 puffs as needed";
    const result = parseMedicationText(raw);

    assert.equal(result.genericName, "Salbutamol");
    assert.equal(result.dosage, "");
    assert.equal(result.form, "Inhaler");
  });

  it("should honor explicit BID frequency and explicit Syrup form over dictionary defaults", () => {
    const raw = "Amoxicillin 250mg/5ml suspension. Give 5ml BID for 5 days.";
    const result = parseMedicationText(raw);

    assert.equal(result.genericName, "Amoxicillin");
    assert.equal(result.form, "Suspension");
    assert.equal(result.frequency, "Twice daily");
    assert.deepEqual(result.scheduleTimes, ["08:00 AM", "08:00 PM"]);
    assert.equal(result.durationDays, 5);
  });

  it("should ignore clinical header stop-words instead of turning them into a drug name", () => {
    const raw = "CSU Health Infirmary Patient Date Rx";
    const result = parseMedicationText(raw);

    assert.equal(result.genericName, "");
    assert.equal(result.dosage, "");
  });

  it("should split and parse multi-medication prescription slips", () => {
    const slip = [
      "1. Cefalexin 500mg capsule",
      "Sig: 1 cap TID for 7 days",
      "2. Biogesic 500mg tablet q6h prn",
      "3. Cetirizine 10mg tablet HS x 5 days",
    ].join("\n");

    const meds = parseMultipleMedications(slip);
    assert.equal(meds.length, 3);
    assert.equal(meds[0]?.genericName, "Cefalexin");
    assert.equal(meds[0]?.durationDays, 7);
    assert.equal(meds[1]?.genericName, "Paracetamol");
    assert.equal(meds[2]?.genericName, "Cetirizine");
    assert.equal(meds[2]?.durationDays, 5);
  });

  it("should parse full pediatric prescription slip with doctor headers and Give instructions", () => {
    const slip = [
      "JANSEN JAMES S. DE GUZMAN, M.D",
      "PEDIATRIC INTENSIVIST",
      "DE GUZMAN MEDICAL HOSPITAL",
      "Burgos St., Dagupan City",
      "Name: JUANA MAANAG Age: 9 y/o",
      "Date: April 1, 2021",
      "Rx",
      "Azithromycin (ZENITH) 200mg/5ml",
      "Give 10 ml 2x a day x 7 days",
      "Levocetirizine (Allerzet) 2.5 mg/5ml",
      "Give 7.5 ml 2x a day x 2 weeks",
    ].join("\n");

    const meds = parseMultipleMedications(slip);
    assert.equal(meds.length, 2);
    assert.equal(meds[0]?.genericName, "Azithromycin");
    assert.equal(meds[0]?.dosage, "200 mg/5 mL");
    assert.equal(meds[0]?.form, "Suspension");
    assert.equal(meds[0]?.frequency, "Twice daily");
    assert.equal(meds[0]?.durationDays, 7);
    assert.equal(meds[1]?.genericName, "Levocetirizine");
    assert.equal(meds[1]?.dosage, "2.5 mg/5 mL");
    assert.equal(meds[1]?.form, "Suspension");
    assert.equal(meds[1]?.frequency, "Twice daily");
    assert.equal(meds[1]?.durationDays, 14);
    assert.equal(meds[0]?.drugClass, "Macrolide Antibiotic");
    assert.ok(meds[0]?.usedFor?.toLowerCase().includes("bacterial"));
    assert.equal(meds[1]?.drugClass, "Antihistamine (Allergy)");
    assert.ok(meds[1]?.usedFor?.toLowerCase().includes("allergic"));
  });

  it("should look up medication purpose offline via brand or generic name and extract explicit slip reasons", () => {
    const biogesic = lookupMedicationPurpose("Biogesic");
    assert.equal(biogesic?.genericName, "Paracetamol");
    assert.equal(biogesic?.drugClass, "Pain & Fever Reliever");
    assert.ok(biogesic?.usedFor.toLowerCase().includes("fever"));

    const ponstan = lookupMedicationPurpose("Ponstan 500 mg");
    assert.equal(ponstan?.genericName, "Mefenamic Acid");
    assert.equal(ponstan?.drugClass, "NSAID Pain Reliever");

    const slipWithReason = parseMedicationText("Mefenamic Acid 500mg. Take 1 cap for toothache.");
    assert.equal(slipWithReason.prescribedFor, "for toothache");

    const unknown = lookupMedicationPurpose("XyzUnknownCompound");
    assert.equal(unknown, null);
  });
});
