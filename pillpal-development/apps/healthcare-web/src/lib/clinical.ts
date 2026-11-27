export const CSU_COLLEGES = [
  "College of Agriculture and Agri-Industries",
  "College of Computing and Information Sciences",
  "College of Education",
  "College of Engineering and Geosciences",
  "College of Forestry and Environmental Science",
  "College of Humanities and Social Sciences",
  "College of Mathematics and Natural Sciences",
] as const;

export const EMPLOYEE_UNITS = [
  ...CSU_COLLEGES,
  "Administrative / Support Office",
] as const;

export const BLOOD_TYPES = [
  "N/A",
  "O+",
  "O-",
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
] as const;

export const GENDER_OPTIONS = [
  "Female",
  "Male",
  "Prefer not to say",
] as const;

export function isValidCsuId(raw: string): boolean {
  return /^(\d{2,4}-\d{4,6}|\d{6,10})$/.test(raw.trim());
}

export function isValidPhPhone(raw: string): boolean {
  const cleaned = raw.replace(/[\s()-]/g, "");
  return /^(\+?63|0)9\d{9}$/.test(cleaned);
}

export function getTodayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function calculateAge(dobIso: string | null | undefined): number | null {
  if (!dobIso) return null;
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

export function formatDobWithAge(dobIso: string | null | undefined): string {
  if (!dobIso) return "Not set";
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return "Not set";
  const formatted = dob.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const age = calculateAge(dobIso);
  return age !== null ? `${formatted} (${age} yrs)` : formatted;
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
    lower !== "n/a"
  );
}

export const DOSAGE_FORMS = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Suspension",
  "Inhaler",
  "Drops",
  "Topical Cream / Ointment",
  "Injection / Vial",
] as const;

export const FREQUENCY_PRESETS: Record<string, string> = {
  "Once daily morning": "08:00 AM",
  "Once daily bedtime": "09:00 PM",
  "Twice daily": "08:00 AM, 08:00 PM",
  "3 times daily": "08:00 AM, 02:00 PM, 08:00 PM",
  "4 times daily": "06:00 AM, 12:00 PM, 06:00 PM, 12:00 AM",
  "As needed (PRN)": "08:00 AM",
};

const DRUG_ALLERGY_FAMILIES: { family: string; keywords: string[] }[] = [
  {
    family: "Penicillin / Beta-Lactam Antibiotics",
    keywords: [
      "penicillin",
      "amoxicillin",
      "amoxil",
      "ampicillin",
      "co-amoxiclav",
      "amoxiclav",
      "augmentin",
      "cloxacillin",
      "oxacillin",
      "piperacillin",
      "cefalexin",
      "cephalexin",
      "cefuroxime",
      "ceftriaxone",
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
      "naproxen",
      "celecoxib",
      "diclofenac",
      "ketorolac",
      "meloxicam",
    ],
  },
  {
    family: "Sulfonamides (Sulfa Drugs)",
    keywords: [
      "sulfa",
      "sulfonamide",
      "sulfamethoxazole",
      "cotrimoxazole",
      "co-trimoxazole",
      "bactrim",
      "trimethoprim",
    ],
  },
  {
    family: "Macrolide Antibiotics",
    keywords: ["macrolide", "erythromycin", "azithromycin", "clarithromycin"],
  },
  {
    family: "Paracetamol / Acetaminophen",
    keywords: ["paracetamol", "acetaminophen", "biogesic", "tylenol"],
  },
  {
    family: "Fluoroquinolones",
    keywords: ["ciprofloxacin", "levofloxacin", "ofloxacin", "fluoroquinolone"],
  },
];

export type AllergyConflictResult = {
  hasConflict: boolean;
  matchedTerms: string[];
  warningMessage: string;
};

export function checkAllergyConflict(
  medicationName: string,
  patientAllergies: string | null | undefined,
): AllergyConflictResult {
  const medClean = medicationName.trim().toLowerCase();
  if (!medClean || !hasDocumentedDrugAllergy(patientAllergies)) {
    return { hasConflict: false, matchedTerms: [], warningMessage: "" };
  }

  const allergyClean = (patientAllergies || "").toLowerCase();
  const matchedTerms = new Set<string>();

  // 1. Direct token match (words >= 4 chars in patient's allergy string)
  const allergyTokens = allergyClean
    .split(/[,;/()]+|\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !["mild", "moderate", "severe", "allergy", "drug", "known"].includes(t));

  for (const token of allergyTokens) {
    if (medClean.includes(token)) {
      matchedTerms.add(token);
    }
  }

  // 2. Clinical drug-class cross-reaction match
  const matchedFamilies: string[] = [];
  for (const group of DRUG_ALLERGY_FAMILIES) {
    const allergyHitsGroup = group.keywords.some((kw) => allergyClean.includes(kw));
    const medHitsGroup = group.keywords.some((kw) => medClean.includes(kw));
    if (allergyHitsGroup && medHitsGroup) {
      matchedFamilies.push(group.family);
    }
  }

  if (matchedTerms.size === 0 && matchedFamilies.length === 0) {
    return { hasConflict: false, matchedTerms: [], warningMessage: "" };
  }

  const familyNote =
    matchedFamilies.length > 0
      ? ` Cross-reactivity alert: ${matchedFamilies.join(", ")}.`
      : "";

  return {
    hasConflict: true,
    matchedTerms: Array.from(matchedTerms),
    warningMessage: `Potential contraindication detected! "${medicationName.trim()}" may conflict with this patient's documented allergy (${patientAllergies}).${familyNote}`,
  };
}

