import drugDictionary from "./drug-dictionary.json";

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

/**
 * Compute Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  const aLen = a.length;
  const bLen = b.length;

  for (let i = 0; i <= bLen; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= aLen; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bLen; i++) {
    for (let j = 1; j <= aLen; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1),
        );
      }
    }
  }

  return matrix[bLen][aLen];
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

  // Weeks (e.g. "for 2 weeks")
  const weeksMatch = normalized.match(/\b(?:for|x|×)?\s*(\d{1,2})\s*weeks?\b/i);
  if (weeksMatch) {
    const days = Number(weeksMatch[1]) * 7;
    if (days > 0 && days <= 365) return days;
  }

  // Dispense quantity (e.g. "#21" at 3x/day = 7 days)
  const qtyMatch = normalized.match(/#\s*(\d{1,3})\b/);
  if (qtyMatch && dosesPerDay > 0) {
    const qty = Number(qtyMatch[1]);
    const estimated = Math.round(qty / dosesPerDay);
    if (estimated >= 1 && estimated <= 180) return estimated;
  }

  return null;
}

function extractPrescribedFor(normalized: string): string | undefined {
  // Match explicit symptom/reason phrases like "for fever", "for toothache", "for allergy relief", "for UTI"
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

  const orderedDict = [...drugDictionary].sort(
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

  // Soft fuzzy match for slight spelling typos when user types manually
  const tokens = clean.split(/[^a-z0-9-]+/).filter((t) => t.length >= 4);
  let bestDrug: (typeof drugDictionary)[0] | null = null;
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

/**
 * Parses raw OCR text (from prescription slip or pill bottle label)
 * completely offline using regex patterns and local Philippine drug dictionary.
 */
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

  // 1. Extract Dosage (NEVER fabricate a default like "500 mg" if missing)
  const dosageMatch = normalized.match(
    /\b\d+(?:\.\d+)?\s*(?:mg|g|mcg|mL|ml|IU|iu|mEq|meq)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:mL|ml|mg|dose))?/i,
  );
  const dosage = dosageMatch ? normalizeDosageString(dosageMatch[0]) : "";

  // 2. Extract Frequency & Timing
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

  // 3. Extract Form (honors explicit label form over dictionary default)
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

  // 4. Fuzzy Match against Local Philippine Drug Dictionary
  let bestMatch: (typeof drugDictionary)[0] | null = null;
  let lowestDistance = 999;
  let matchedBrand: string | undefined = undefined;

  const words = normalized.split(/[^a-zA-Z0-9-]+/).filter((w) => w.length >= 3);
  const candidates = [...words];
  for (let i = 0; i < words.length - 1; i++) {
    candidates.push(`${words[i]} ${words[i + 1]}`);
  }

  const lowerNorm = normalized.toLowerCase();
  // Sort longest genericName first so "Levocetirizine" beats "Cetirizine" and "Ibuprofen + Paracetamol" beats "Ibuprofen"
  const orderedDict = [...drugDictionary].sort(
    (a, b) => b.genericName.length - a.genericName.length,
  );

  for (const drug of orderedDict) {
    // Direct word-bounded match first for exact generic names (e.g. "Levocetirizine" vs "Cetirizine")
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

    // Direct substring match for exact brand names (e.g. "Biogesic", "Allerzet", "Solmux")
    for (const brand of drug.commonBrands) {
      if (brand.length >= 4 && lowerNorm.includes(brand.toLowerCase())) {
        lowestDistance = 0;
        bestMatch = drug;
        matchedBrand = brand;
        break;
      }
    }
    if (lowestDistance === 0 && bestMatch) break;

    // Fuzzy Levenshtein match for OCR camera glare typos (e.g. "AM0XIC1LLIN")
    for (const token of candidates) {
      const lowerTok = token.toLowerCase();
      if (CLINICAL_STOP_WORDS.has(lowerTok) || /^\d+$/.test(lowerTok)) continue;

      const dist = levenshteinDistance(lowerTok, drug.genericName.toLowerCase());
      const maxAllowedDist = Math.max(1, Math.floor(drug.genericName.length * 0.3));

      if (dist <= maxAllowedDist && dist < lowestDistance) {
        lowestDistance = dist;
        bestMatch = drug;
        matchedBrand = undefined;
      }

      for (const brand of drug.commonBrands) {
        const brandDist = levenshteinDistance(lowerTok, brand.toLowerCase());
        const maxBrandDist = Math.max(1, Math.floor(brand.length * 0.28));

        if (brandDist <= maxBrandDist && brandDist < lowestDistance) {
          lowestDistance = brandDist;
          bestMatch = drug;
          matchedBrand = brand;
        }
      }
    }
  }

  // Fallback candidate ignoring clinical header stop-words & pure numbers
  const meaningfulWord = words.find(
    (w) =>
      w.length >= 4 &&
      !/^\d+$/.test(w) &&
      !/^\d+(mg|g|ml|mcg)$/i.test(w) &&
      !CLINICAL_STOP_WORDS.has(w.toLowerCase()),
  );

  const genericName = bestMatch ? bestMatch.genericName : meaningfulWord || "";
  const brandName = matchedBrand || (bestMatch && bestMatch.commonBrands[0]) || undefined;
  const finalForm = explicitFormMatched ? form : bestMatch ? bestMatch.form : form;
  const finalFrequency = explicitFreqMatched
    ? frequency
    : bestMatch?.defaultFrequency || frequency;
  const finalScheduleTimes = explicitFreqMatched
    ? scheduleTimes
    : bestMatch?.defaultScheduleTimes || scheduleTimes;

  const instructions = bestMatch
    ? bestMatch.instructions
    : "Take as directed with plenty of water.";

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
    instructions,
    drugClass: bestMatch?.drugClass,
    usedFor: bestMatch?.usedFor,
    keyReminder: bestMatch?.keyReminder,
    prescribedFor,
    confidenceScore,
  };
}

/**
 * Splits multi-line or numbered prescription text (e.g. "1. Amoxicillin...\n2. Paracetamol...")
 * into multiple ExtractedPrescription items while deduplicating repeated drug names.
 */
export function parseMultipleMedications(rawText: string): ExtractedPrescription[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  // Split on numbered bullets ("1.", "2)", "Rx 1:") or line breaks
  const segments = trimmed
    .split(/(?:\r?\n)+|(?=(?:^|\s)(?:\d+[.)]|rx\s*\d*[:.)])\s+)/i)
    .map((s) => s.replace(/^(?:\d+[.)]|[-•*]|rx\s*\d*[:.)]?)\s*/i, "").trim())
    .filter((s) => s.length >= 3);

  // Merge continuation instruction lines ("Sig: 1 tab TID...", "Give 10 ml 2x a day...") onto the previous drug line
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
    // Keep only segments that matched a dictionary drug OR explicitly contain a dosage strength
    const hasSignal = parsed.confidenceScore >= 0.65 || (Boolean(parsed.genericName) && Boolean(parsed.dosage));
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

/**
 * Check if an extracted medication matches an already-ACTIVE prescription
 * to warn the patient against creating duplicate schedules or double-dosing.
 */
export function findDuplicateActiveMedication(
  candidateName: string,
  activeMedications: Array<{ name: string; dosage?: string; doctor_id?: string | null; doctorId?: string | null }>,
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
        isClinicRx: Boolean(rx.doctor_id || rx.doctorId),
      };
    }
  }

  return { isDuplicate: false, existingName: "", isClinicRx: false };
}
