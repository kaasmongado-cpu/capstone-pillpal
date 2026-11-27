import rawDrugDictionary from "../../../patient-mobile/src/services/ocr/drug-dictionary.json";

export interface MedicationPurposeInfo {
  genericName: string;
  drugClass: string;
  usedFor: string;
  keyReminder: string;
  source: "curated-offline" | "ai-vision";
}

export interface ExtractedPrescription {
  genericName: string;
  brandName?: string;
  dosage: string;
  form: string;
  frequency: string;
  scheduleTimes: string[];
  durationDays?: number | null;
  instructions: string;
  drugClass?: string;
  usedFor?: string;
  keyReminder?: string;
  prescribedFor?: string;
  confidenceScore: number;
}

interface DrugEntry {
  genericName: string;
  commonBrands: string[];
  form: string;
  defaultFrequency: string;
  defaultScheduleTimes: string[];
  instructions: string;
  drugClass: string;
  usedFor: string;
  keyReminder: string;
}

const PH_DRUG_DICTIONARY: DrugEntry[] = rawDrugDictionary as DrugEntry[];

const CLINICAL_STOP_WORDS = new Set([
  "rx",
  "sig",
  "disp",
  "dispense",
  "patient",
  "name",
  "age",
  "sex",
  "date",
  "address",
  "doctor",
  "physician",
  "clinic",
  "hospital",
  "infirmary",
  "health",
  "center",
  "wellness",
  "university",
  "caraga",
  "state",
  "csu",
  "pharmacy",
  "drug",
  "drugstore",
  "mercury",
  "watsons",
  "southstar",
  "generika",
  "tgp",
  "generic",
  "brand",
  "take",
  "tab",
  "tabs",
  "tablet",
  "tablets",
  "cap",
  "caps",
  "capsule",
  "capsules",
  "syrup",
  "suspension",
  "drops",
  "inhaler",
  "sachet",
  "cream",
  "oral",
  "daily",
  "once",
  "twice",
  "three",
  "four",
  "times",
  "every",
  "hours",
  "hour",
  "days",
  "day",
  "meals",
  "meal",
  "after",
  "before",
  "with",
  "water",
  "for",
  "prn",
  "bid",
  "tid",
  "qid",
  "od",
  "hs",
  "pc",
  "ac",
  "lic",
  "ptr",
  "s2",
  "no",
  "refill",
  "qty",
  "quantity",
  "directions",
  "instructions",
  "warning",
  "dosage",
  "strength",
  "expiration",
  "exp",
  "lot",
  "mfg",
  "give",
  "administer",
  "pediatric",
  "intensivist",
  "medical",
  "signature",
  "tel",
  "street",
  "city",
  "weeks",
  "week",
]);

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0]![j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i]![j] =
        b.charAt(i - 1) === a.charAt(j - 1)
          ? matrix[i - 1]![j - 1]!
          : Math.min(matrix[i - 1]![j - 1]! + 1, matrix[i]![j - 1]! + 1, matrix[i - 1]![j]! + 1);
    }
  }
  return matrix[b.length]![a.length]!;
}

function normalizeDosageString(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(\d)(mg|g|mcg|ml|iu|meq)\b/gi, "$1 $2")
    .replace(/\bmg\b/gi, "mg")
    .replace(/\bmcg\b/gi, "mcg")
    .replace(/\bml\b/gi, "mL")
    .replace(/\biu\b/gi, "IU");
}

function extractDurationDays(normalized: string, dosesPerDay: number): number | null {
  const daysMatch = normalized.match(
    /\b(?:for|x|×)\s*(\d{1,3})\s*(?:days?|d)\b|\b(\d{1,3})\s*days?\b/i,
  );
  if (daysMatch) {
    const val = Number(daysMatch[1] || daysMatch[2]);
    if (val > 0 && val <= 365) return val;
  }

  const weeksMatch = normalized.match(/\b(?:for|x|×)?\s*(\d{1,2})\s*weeks?\b/i);
  if (weeksMatch) {
    const days = Number(weeksMatch[1]) * 7;
    if (days > 0 && days <= 365) return days;
  }

  const qtyMatch = normalized.match(/#\s*(\d{1,3})\b/);
  if (qtyMatch && dosesPerDay > 0) {
    const qty = Number(qtyMatch[1]);
    const estimated = Math.round(qty / dosesPerDay);
    if (estimated >= 1 && estimated <= 180) return estimated;
  }

  return null;
}

function extractPrescribedFor(normalized: string): string | undefined {
  const match = normalized.match(
    /\bfor\s+(fever|mild\s+pain|pain|toothache|headache|body\s+aches?|coughs?|colds?|flu|allerg(?:y|ies|ic\s+rhinitis)|hives|itching|asthma|shortness\s+of\s+breath|stomach\s+(?:pain|cramps?|upset)|abdominal\s+(?:pain|cramps?|spasms?)|diarrhea|hyperacidity|acid\s+reflux|heartburn|nausea|vomiting|uti|urinary\s+tract\s+infection|bacterial\s+infection|infection|sore\s+throat|dysmenorrhea|menstrual\s+cramps?|hypertension|blood\s+pressure|diabetes|cholesterol|anemia)(?:\s+(?:or|and)\s+[a-z\s]{3,24})?/i,
  );
  if (!match?.[0]) return undefined;
  return match[0].trim();
}

/**
 * Look up what a medication is used for offline from the curated 43-drug Philippine guide.
 * Works on both generic names ("Azithromycin") and brand names ("Biogesic", "Allerzet", "Ponstan").
 */
export function lookupMedicationPurpose(
  medicationName: string,
): MedicationPurposeInfo | null {
  const clean = medicationName.trim().toLowerCase();
  if (!clean || clean.length < 3) return null;

  const orderedDict = [...PH_DRUG_DICTIONARY].sort(
    (a, b) => b.genericName.length - a.genericName.length,
  );

  for (const drug of orderedDict) {
    const escapedGeneric = drug.genericName
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const genericRegex = new RegExp(`(?:^|[^a-z0-9])${escapedGeneric}(?:$|[^a-z0-9])`, "i");
    if (genericRegex.test(clean)) {
      return {
        genericName: drug.genericName,
        drugClass: drug.drugClass,
        usedFor: drug.usedFor,
        keyReminder: drug.keyReminder,
        source: "curated-offline",
      };
    }

    for (const brand of drug.commonBrands) {
      if (brand.length >= 4 && clean.includes(brand.toLowerCase())) {
        return {
          genericName: drug.genericName,
          drugClass: drug.drugClass,
          usedFor: drug.usedFor,
          keyReminder: drug.keyReminder,
          source: "curated-offline",
        };
      }
    }
  }

  const tokens = clean.split(/[^a-z0-9-]+/).filter((t) => t.length >= 4);
  let bestDrug: DrugEntry | null = null;
  let bestDist = 999;

  for (const drug of orderedDict) {
    for (const token of tokens) {
      const dist = levenshteinDistance(token, drug.genericName.toLowerCase());
      const maxDist = Math.max(1, Math.floor(drug.genericName.length * 0.25));
      if (dist <= maxDist && dist < bestDist) {
        bestDist = dist;
        bestDrug = drug;
      }
    }
  }

  if (bestDrug) {
    return {
      genericName: bestDrug.genericName,
      drugClass: bestDrug.drugClass,
      usedFor: bestDrug.usedFor,
      keyReminder: bestDrug.keyReminder,
      source: "curated-offline",
    };
  }

  return null;
}

export function parseMedicationText(rawText: string): ExtractedPrescription {
  const normalized = rawText
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return {
      genericName: "",
      dosage: "",
      form: "Tablet",
      frequency: "Once daily",
      scheduleTimes: ["08:00 AM"],
      durationDays: null,
      instructions: "",
      confidenceScore: 0,
    };
  }

  // Never fabricate a dosage if not present in the label text
  const dosageMatch = normalized.match(
    /\b\d+(?:\.\d+)?\s*(?:mg|g|mcg|mL|ml|IU|iu|mEq|meq)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:mL|ml|mg|dose))?/i,
  );
  const dosage = dosageMatch ? normalizeDosageString(dosageMatch[0]) : "";

  let frequency = "Twice daily";
  let scheduleTimes = ["08:00 AM", "08:00 PM"];
  let explicitFreqMatched = false;

  if (/\b(tid|3\s*times|3x|three\s*times|every\s*8\s*hours?|q8h)\b/i.test(normalized)) {
    frequency = "Three times daily";
    scheduleTimes = ["08:00 AM", "02:00 PM", "08:00 PM"];
    explicitFreqMatched = true;
  } else if (/\b(qid|4\s*times|4x|four\s*times|every\s*6\s*hours?|q6h)\b/i.test(normalized)) {
    frequency = "Four times daily";
    scheduleTimes = ["08:00 AM", "12:00 PM", "04:00 PM", "08:00 PM"];
    explicitFreqMatched = true;
  } else if (/\b(bid|2\s*times|2x|twice\s*daily|every\s*12\s*hours?|q12h)\b/i.test(normalized)) {
    frequency = "Twice daily";
    scheduleTimes = ["08:00 AM", "08:00 PM"];
    explicitFreqMatched = true;
  } else if (/\b(hs|at\s*bedtime|every\s*night|before\s*bed)\b/i.test(normalized)) {
    frequency = "Once daily at bedtime";
    scheduleTimes = ["09:00 PM"];
    explicitFreqMatched = true;
  } else if (/\b(od|1x|once\s*daily|once\s*a\s*day|every\s*day|every\s*morning)\b/i.test(normalized)) {
    frequency = "Once daily morning";
    scheduleTimes = ["08:00 AM"];
    explicitFreqMatched = true;
  } else if (/\b(every\s*4\s*hours?|q4h)\b/i.test(normalized)) {
    frequency = "Every 4 hours";
    scheduleTimes = ["08:00 AM", "12:00 PM", "04:00 PM", "08:00 PM"];
    explicitFreqMatched = true;
  } else if (/\b(prn|as\s*needed)\b/i.test(normalized)) {
    frequency = "As needed for symptoms";
    scheduleTimes = ["08:00 AM", "02:00 PM", "08:00 PM"];
  }

  let form = "Tablet";
  let explicitFormMatched = false;
  if (/\b(capsule|capsules|cap|caps)\b/i.test(normalized)) {
    form = "Capsule";
    explicitFormMatched = true;
  } else if (/\b(tablet|tablets|tab|tabs)\b/i.test(normalized)) {
    form = "Tablet";
    explicitFormMatched = true;
  } else if (/\b(suspension)\b/i.test(normalized)) {
    form = "Suspension";
    explicitFormMatched = true;
  } else if (/\b(syrup|liquid|elixir)\b/i.test(normalized)) {
    form = "Syrup";
    explicitFormMatched = true;
  } else if (/\b(inhaler|puff|puffs|spray|nebule)\b/i.test(normalized)) {
    form = "Inhaler";
    explicitFormMatched = true;
  } else if (/\b(drops?|gtt)\b/i.test(normalized)) {
    form = "Drops";
    explicitFormMatched = true;
  } else if (/\b(sachet|sachets|powder)\b/i.test(normalized)) {
    form = "Sachet";
    explicitFormMatched = true;
  } else if (/\b(cream|ointment|gel)\b/i.test(normalized)) {
    form = "Cream";
    explicitFormMatched = true;
  } else if (/\/\s*\d+(?:\.\d+)?\s*m[lL]\b/i.test(dosage)) {
    form = "Suspension";
    explicitFormMatched = true;
  }

  let bestMatch: DrugEntry | null = null;
  let lowestDistance = 999;
  let matchedBrand: string | undefined;

  const words = normalized.split(/[^a-zA-Z0-9-]+/).filter((w) => w.length >= 3);
  const candidates = [...words];
  for (let i = 0; i < words.length - 1; i++) {
    candidates.push(`${words[i]} ${words[i + 1]}`);
  }

  const lowerNorm = normalized.toLowerCase();
  const orderedDict = [...PH_DRUG_DICTIONARY].sort(
    (a, b) => b.genericName.length - a.genericName.length,
  );

  for (const drug of orderedDict) {
    const escapedGeneric = drug.genericName
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const genericRegex = new RegExp(`(?:^|[^a-z0-9])${escapedGeneric}(?:$|[^a-z0-9])`, "i");
    if (genericRegex.test(lowerNorm)) {
      lowestDistance = 0;
      bestMatch = drug;
      for (const brand of drug.commonBrands) {
        if (lowerNorm.includes(brand.toLowerCase())) {
          matchedBrand = brand;
          break;
        }
      }
      break;
    }

    for (const brand of drug.commonBrands) {
      if (brand.length >= 4 && lowerNorm.includes(brand.toLowerCase())) {
        lowestDistance = 0;
        bestMatch = drug;
        matchedBrand = brand;
        break;
      }
    }
    if (lowestDistance === 0 && bestMatch) break;

    for (const token of candidates) {
      const lowerTok = token.toLowerCase();
      if (CLINICAL_STOP_WORDS.has(lowerTok) || /^\d+$/.test(lowerTok)) continue;

      const dist = levenshteinDistance(lowerTok, drug.genericName.toLowerCase());
      const maxAllowed = Math.max(1, Math.floor(drug.genericName.length * 0.3));
      if (dist <= maxAllowed && dist < lowestDistance) {
        lowestDistance = dist;
        bestMatch = drug;
        matchedBrand = undefined;
      }

      for (const brand of drug.commonBrands) {
        const bDist = levenshteinDistance(lowerTok, brand.toLowerCase());
        const maxBrand = Math.max(1, Math.floor(brand.length * 0.28));
        if (bDist <= maxBrand && bDist < lowestDistance) {
          lowestDistance = bDist;
          bestMatch = drug;
          matchedBrand = brand;
        }
      }
    }
  }

  const meaningfulWord = words.find(
    (w) =>
      w.length >= 4 &&
      !/^\d+$/.test(w) &&
      !/^\d+(mg|g|ml|mcg)$/i.test(w) &&
      !CLINICAL_STOP_WORDS.has(w.toLowerCase()),
  );

  const genericName = bestMatch ? bestMatch.genericName : meaningfulWord || "";
  const brandName = matchedBrand || bestMatch?.commonBrands[0];
  const finalForm = explicitFormMatched ? form : bestMatch ? bestMatch.form : form;
  const finalFrequency = explicitFreqMatched
    ? frequency
    : bestMatch?.defaultFrequency || frequency;
  const finalScheduleTimes = explicitFreqMatched
    ? scheduleTimes
    : bestMatch?.defaultScheduleTimes || scheduleTimes;

  const durationDays = extractDurationDays(normalized, finalScheduleTimes.length);
  const prescribedFor = extractPrescribedFor(normalized);
  const confidenceScore = bestMatch
    ? Math.max(0.65, 1.0 - lowestDistance * 0.1)
    : genericName
      ? 0.45
      : 0;

  return {
    genericName,
    brandName,
    dosage,
    form: finalForm,
    frequency: finalFrequency,
    scheduleTimes: finalScheduleTimes,
    durationDays,
    instructions: bestMatch?.instructions || "Take as directed with water.",
    drugClass: bestMatch?.drugClass,
    usedFor: bestMatch?.usedFor,
    keyReminder: bestMatch?.keyReminder,
    prescribedFor,
    confidenceScore,
  };
}

export function parseMultipleMedications(rawText: string): ExtractedPrescription[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  const segments = trimmed
    .split(/(?:\r?\n)+|(?=(?:^|\s)(?:\d+[.)]|rx\s*\d*[:.)])\s+)/i)
    .map((s) => s.replace(/^(?:\d+[.)]|[-•*]|rx\s*\d*[:.)]?)\s*/i, "").trim())
    .filter((s) => s.length >= 3);

  const mergedSegments: string[] = [];
  for (const seg of segments) {
    const looksLikeInstructionOnly =
      /^(sig[:\s]|take\s+\d|give\s+\d|administer\s+\d|disp|#|for\s+\d+\s*day|apply|inhale|instill)/i.test(
        seg,
      );
    if (looksLikeInstructionOnly && mergedSegments.length > 0) {
      mergedSegments[mergedSegments.length - 1] = `${mergedSegments[mergedSegments.length - 1]} ${seg}`;
    } else {
      mergedSegments.push(seg);
    }
  }

  if (mergedSegments.length <= 1) {
    const single = parseMedicationText(trimmed);
    return single.genericName ? [single] : [];
  }

  const results: ExtractedPrescription[] = [];
  const seenNames = new Set<string>();

  for (const seg of mergedSegments) {
    const parsed = parseMedicationText(seg);
    const hasSignal =
      parsed.confidenceScore >= 0.65 || (Boolean(parsed.genericName) && Boolean(parsed.dosage));
    if (!hasSignal || !parsed.genericName) continue;

    const key = parsed.genericName.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    results.push(parsed);
  }

  if (results.length === 0) {
    const fallback = parseMedicationText(trimmed);
    return fallback.genericName ? [fallback] : [];
  }

  return results;
}

export function findDuplicateActiveMedication(
  candidateName: string,
  activeMedications: Array<{ name: string; dosage?: string; doctorId?: string | null; source?: string }>,
): { isDuplicate: boolean; existingName: string; isClinicRx: boolean } {
  const clean = candidateName.trim().toLowerCase();
  if (!clean || clean.length < 3) {
    return { isDuplicate: false, existingName: "", isClinicRx: false };
  }

  for (const rx of activeMedications) {
    const existing = (rx.name || "").trim().toLowerCase();
    if (!existing) continue;
    if (existing === clean || existing.includes(clean) || clean.includes(existing)) {
      return {
        isDuplicate: true,
        existingName: rx.dosage ? `${rx.name} (${rx.dosage})` : rx.name,
        isClinicRx: rx.source === "CLINIC_RX" || Boolean(rx.doctorId),
      };
    }
  }

  return { isDuplicate: false, existingName: "", isClinicRx: false };
}

export function hasDocumentedDrugAllergy(allergies: string | null | undefined): boolean {
  if (!allergies) return false;
  const lower = allergies.trim().toLowerCase();
  if (!lower) return false;
  return (
    !lower.includes("no known") &&
    lower !== "nka" &&
    lower !== "nkda" &&
    lower !== "none" &&
    lower !== "none reported" &&
    lower !== "none recorded" &&
    lower !== "n/a"
  );
}

const DRUG_ALLERGY_FAMILIES: { family: string; keywords: string[] }[] = [
  {
    family: "Penicillin / Beta-Lactam Antibiotics",
    keywords: [
      "penicillin",
      "amoxicillin",
      "amoxil",
      "himox",
      "ampicillin",
      "co-amoxiclav",
      "amoxiclav",
      "augmentin",
      "cloxacillin",
      "cefalexin",
      "cephalexin",
      "cefuroxime",
      "zinnat",
      "cephalosporin",
      "beta-lactam",
    ],
  },
  {
    family: "NSAIDs / Aspirin",
    keywords: [
      "nsaid",
      "aspirin",
      "ibuprofen",
      "advil",
      "alaxan",
      "mefenamic",
      "ponstan",
      "dolfenal",
      "naproxen",
      "flanax",
      "celecoxib",
      "celebrex",
      "diclofenac",
    ],
  },
  {
    family: "Sulfonamides (Sulfa Drugs)",
    keywords: ["sulfa", "sulfonamide", "sulfamethoxazole", "cotrimoxazole", "bactrim", "septrin"],
  },
  {
    family: "Macrolide Antibiotics",
    keywords: ["macrolide", "erythromycin", "azithromycin", "zithromax", "clarithromycin"],
  },
  {
    family: "Paracetamol / Acetaminophen",
    keywords: ["paracetamol", "acetaminophen", "biogesic", "tylenol", "bioflu", "neozep"],
  },
  {
    family: "Fluoroquinolones",
    keywords: ["ciprofloxacin", "levofloxacin", "ofloxacin", "fluoroquinolone"],
  },
  {
    family: "Tetracyclines",
    keywords: ["tetracycline", "doxycycline", "vibramycin", "minocycline"],
  },
];

export function checkAllergyConflict(
  medicationName: string,
  patientAllergies: string | null | undefined,
): { hasConflict: boolean; warningMessage: string } {
  const medClean = medicationName.trim().toLowerCase();
  if (!medClean || !hasDocumentedDrugAllergy(patientAllergies)) {
    return { hasConflict: false, warningMessage: "" };
  }

  const allergyClean = (patientAllergies || "").toLowerCase();
  const matchedTerms = new Set<string>();
  const tokens = allergyClean
    .split(/[,;/()]+|\s+/)
    .map((t) => t.trim())
    .filter(
      (t) =>
        t.length >= 4 &&
        !["mild", "moderate", "severe", "allergy", "drug", "known"].includes(t),
    );

  for (const token of tokens) {
    if (medClean.includes(token)) matchedTerms.add(token);
  }

  const matchedFamilies: string[] = [];
  for (const group of DRUG_ALLERGY_FAMILIES) {
    if (
      group.keywords.some((kw) => allergyClean.includes(kw)) &&
      group.keywords.some((kw) => medClean.includes(kw))
    ) {
      matchedFamilies.push(group.family);
    }
  }

  if (matchedTerms.size === 0 && matchedFamilies.length === 0) {
    return { hasConflict: false, warningMessage: "" };
  }

  const familyNote =
    matchedFamilies.length > 0 ? ` Cross-reactivity alert: ${matchedFamilies.join(", ")}.` : "";
  return {
    hasConflict: true,
    warningMessage: `"${medicationName.trim()}" may conflict with your documented allergy (${patientAllergies}).${familyNote}`,
  };
}

export async function compressImageFileToBase64(
  file: File,
): Promise<{ previewUrl: string; base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read selected file."));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) {
        reject(new Error("Empty image data."));
        return;
      }
      const img = new Image();
      img.onerror = () => {
        const base64 = dataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
        resolve({ previewUrl: dataUrl, base64, mimeType: file.type || "image/jpeg" });
      };
      img.onload = () => {
        const maxDim = 1600;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          const base64 = dataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
          resolve({ previewUrl: dataUrl, base64, mimeType: file.type || "image/jpeg" });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL("image/jpeg", 0.82);
        resolve({
          previewUrl: compressed,
          base64: compressed.replace(/^data:image\/jpeg;base64,/, ""),
          mimeType: "image/jpeg",
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export async function rotateImageDataUrl90(
  dataUrl: string,
): Promise<{ previewUrl: string; base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Unable to rotate image."));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not available."));
        return;
      }
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      const rotated = canvas.toDataURL("image/jpeg", 0.84);
      resolve({
        previewUrl: rotated,
        base64: rotated.replace(/^data:image\/jpeg;base64,/, ""),
        mimeType: "image/jpeg",
      });
    };
    img.src = dataUrl;
  });
}

async function preprocessImageForTesseract(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(dataUrl);
    img.onload = () => {
      const targetMax = 1800;
      const targetMin = 1000;
      let width = img.width;
      let height = img.height;
      const longest = Math.max(width, height);

      if (longest > targetMax) {
        const ratio = targetMax / longest;
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      } else if (longest < targetMin && longest > 0) {
        const ratio = Math.min(2, targetMin / longest);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      try {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const contrast = 1.45;
        const intercept = 128 * (1 - contrast);

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;
          const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const boosted = Math.max(0, Math.min(255, Math.round(gray * contrast + intercept)));
          data[i] = boosted;
          data[i + 1] = boosted;
          data[i + 2] = boosted;
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(dataUrl);
      }
    };
    img.src = dataUrl;
  });
}

type TesseractProgressCallback = (percent: number, status: string) => void;

let cachedTesseractWorkerPromise: Promise<any> | null = null;
let activeTesseractProgressCb: TesseractProgressCallback | null = null;

function formatTesseractStatus(rawStatus: string): string {
  const s = rawStatus.toLowerCase();
  if (s.includes("loading tesseract core")) return "Loading local OCR core...";
  if (s.includes("initializing tesseract")) return "Initializing OCR engine...";
  if (s.includes("loading language")) return "Downloading English OCR model (first run only)...";
  if (s.includes("initializing api")) return "Preparing text recognizer...";
  if (s.includes("recognizing text")) return "Reading medication label locally...";
  return "Running browser OCR...";
}

async function getOrCreateTesseractWorker() {
  if (!cachedTesseractWorkerPromise) {
    cachedTesseractWorkerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (msg) => {
          if (!activeTesseractProgressCb) return;
          const pct =
            typeof msg?.progress === "number"
              ? Math.max(0, Math.min(100, Math.round(msg.progress * 100)))
              : 0;
          activeTesseractProgressCb(pct, formatTesseractStatus(msg?.status || ""));
        },
      });
      return worker;
    })().catch((err) => {
      cachedTesseractWorkerPromise = null;
      throw err;
    });
  }
  return cachedTesseractWorkerPromise;
}

export async function recognizeTextWithTesseract(
  imageDataUrl: string,
  onProgress?: TesseractProgressCallback,
): Promise<{ text: string; confidence: number }> {
  activeTesseractProgressCb = onProgress || null;
  try {
    onProgress?.(5, "Enhancing label contrast...");
    const preprocessed = await preprocessImageForTesseract(imageDataUrl);
    const worker = await getOrCreateTesseractWorker();
    const result = await worker.recognize(preprocessed, { rotateAuto: true });
    const raw = typeof result?.data?.text === "string" ? result.data.text : "";
    const cleaned = raw
      .replace(/[|¦~`_^]/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const confidence =
      typeof result?.data?.confidence === "number" ? result.data.confidence : 0;

    return { text: cleaned, confidence };
  } finally {
    activeTesseractProgressCb = null;
  }
}
