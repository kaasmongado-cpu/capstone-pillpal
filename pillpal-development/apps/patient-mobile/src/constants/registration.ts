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

export function isValidIsoDate(raw: string): boolean {
  const clean = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return false;
  const parsed = new Date(`${clean}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed <= new Date();
}

export function isValidEmailFormat(raw: string): boolean {
  const cleanEmail = raw.trim().toLowerCase();
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  const hasValidTld =
    cleanEmail.includes(".") && (cleanEmail.split(".").pop()?.length ?? 0) >= 2;
  return emailRegex.test(cleanEmail) && hasValidTld;
}

export interface PasswordStrength {
  hasMinLength: boolean;
  hasUpper: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  isValid: boolean;
  score: number;
  label: string;
}

export function evaluatePasswordStrength(password: string): PasswordStrength {
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const score = [hasMinLength, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
  const isValid = hasMinLength && hasUpper && hasNumber;

  let label = "Weak";
  if (score === 4 && password.length >= 10) label = "Strong";
  else if (isValid) label = "Good";
  else if (score >= 2) label = "Fair";

  return {
    hasMinLength,
    hasUpper,
    hasNumber,
    hasSpecial,
    isValid,
    score,
    label,
  };
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

export interface AllergyConflictResult {
  hasConflict: boolean;
  matchedTerms: string[];
  warningMessage: string;
}

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

  const allergyTokens = allergyClean
    .split(/[,;/()]+|\s+/)
    .map((t) => t.trim())
    .filter(
      (t) =>
        t.length >= 4 &&
        !["mild", "moderate", "severe", "allergy", "drug", "known"].includes(t),
    );

  for (const token of allergyTokens) {
    if (medClean.includes(token)) {
      matchedTerms.add(token);
    }
  }

  const matchedFamilies: string[] = [];
  for (const group of DRUG_ALLERGY_FAMILIES) {
    const allergyHits = group.keywords.some((kw) => allergyClean.includes(kw));
    const medHits = group.keywords.some((kw) => medClean.includes(kw));
    if (allergyHits && medHits) {
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
    warningMessage: `"${medicationName.trim()}" may conflict with your recorded allergy (${patientAllergies}).${familyNote}`,
  };
}
