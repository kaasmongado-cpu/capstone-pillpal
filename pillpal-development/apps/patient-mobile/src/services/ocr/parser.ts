import drugDictionary from "./drug-dictionary.json";

export interface ExtractedPrescription {
  genericName: string;
  brandName?: string;
  dosage: string;
  form: string;
  frequency: string;
  scheduleTimes: string[];
  instructions: string;
  confidenceScore: number;
}

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
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          )
        );
      }
    }
  }

  return matrix[bLen][aLen];
}

/**
 * Parses raw OCR text (from prescription slip or pill bottle label)
 * completely offline using regex patterns and local drug dictionary.
 */
export function parseMedicationText(rawText: string): ExtractedPrescription {
  const normalized = rawText
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 1. Extract Dosage (e.g. "500 mg", "250mg", "10 mg", "5mg/5ml")
  const dosageMatch = normalized.match(
    /(\b\d+(\.\d+)?)\s*(mg|g|mcg|ml|iu|meq)(\s*\/\s*\d+\s*(ml|mg))?/i
  );
  const dosage = dosageMatch ? dosageMatch[0].toLowerCase().replace(/\s*mg/i, " mg") : "500 mg";

  // 2. Extract Frequency & Timing
  let frequency = "Twice daily";
  let scheduleTimes = ["08:00 AM", "08:00 PM"];

  if (/\b(tid|3\s*times|three\s*times|every\s*8\s*hours?|q8h)\b/i.test(normalized)) {
    frequency = "Three times daily";
    scheduleTimes = ["08:00 AM", "02:00 PM", "08:00 PM"];
  } else if (/\b(qid|4\s*times|four\s*times|every\s*6\s*hours?|q6h)\b/i.test(normalized)) {
    frequency = "Four times daily";
    scheduleTimes = ["08:00 AM", "12:00 PM", "04:00 PM", "08:00 PM"];
  } else if (/\b(bid|2\s*times|twice\s*daily|every\s*12\s*hours?|q12h)\b/i.test(normalized)) {
    frequency = "Twice daily";
    scheduleTimes = ["08:00 AM", "08:00 PM"];
  } else if (/\b(od|once\s*daily|every\s*day|every\s*morning)\b/i.test(normalized)) {
    frequency = "Once daily morning";
    scheduleTimes = ["08:00 AM"];
  } else if (/\b(hs|at\s*bedtime|every\s*night)\b/i.test(normalized)) {
    frequency = "Once daily at bedtime";
    scheduleTimes = ["09:00 PM"];
  } else if (/\b(prn|as\s*needed)\b/i.test(normalized)) {
    frequency = "As needed for symptoms";
    scheduleTimes = ["08:00 AM", "02:00 PM", "08:00 PM"];
  }

  // 3. Extract Form (Capsule, Tablet, Syrup, Inhaler, Drops)
  let form = "Tablet";
  if (/\b(capsule|cap|caps)\b/i.test(normalized)) form = "Capsule";
  else if (/\b(tablet|tab|tabs)\b/i.test(normalized)) form = "Tablet";
  else if (/\b(syrup|suspension|liquid)\b/i.test(normalized)) form = "Syrup";
  else if (/\b(inhaler|puff|spray)\b/i.test(normalized)) form = "Inhaler";
  else if (/\b(drops?|gtt)\b/i.test(normalized)) form = "Drops";

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

  for (const drug of drugDictionary) {
    // Direct substring match first for multi-word generic names (e.g., "Mefenamic Acid")
    if (lowerNorm.includes(drug.genericName.toLowerCase())) {
      lowestDistance = 0;
      bestMatch = drug;
      break;
    }

    // Check generic name distance across single & bigram candidates
    for (const token of candidates) {
      const dist = levenshteinDistance(token.toLowerCase(), drug.genericName.toLowerCase());
      const maxAllowedDist = Math.max(1, Math.floor(drug.genericName.length * 0.3));

      if (dist <= maxAllowedDist && dist < lowestDistance) {
        lowestDistance = dist;
        bestMatch = drug;
      }

      // Check common brand names
      for (const brand of drug.commonBrands) {
        const brandDist = levenshteinDistance(token.toLowerCase(), brand.toLowerCase());
        const maxBrandDist = Math.max(1, Math.floor(brand.length * 0.3));

        if (brandDist <= maxBrandDist && brandDist < lowestDistance) {
          lowestDistance = brandDist;
          bestMatch = drug;
          matchedBrand = brand;
        }
      }
    }
  }

  // Fallback if no dictionary match
  const genericName = bestMatch ? bestMatch.genericName : (words[0] ? words[0] : "Prescribed Medication");
  const brandName = matchedBrand || (bestMatch && bestMatch.commonBrands[0]) || undefined;
  const finalForm = bestMatch ? bestMatch.form : form;
  const instructions = bestMatch
    ? bestMatch.instructions
    : "Take as directed with plenty of water.";

  const confidenceScore = bestMatch ? Math.max(0.6, 1.0 - lowestDistance * 0.1) : 0.4;

  return {
    genericName,
    brandName,
    dosage,
    form: finalForm,
    frequency: bestMatch?.defaultFrequency || frequency,
    scheduleTimes: bestMatch?.defaultScheduleTimes || scheduleTimes,
    instructions,
    confidenceScore,
  };
}

