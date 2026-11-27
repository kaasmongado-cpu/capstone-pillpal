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

export function isValidEmailFormat(raw: string): boolean {
  const cleanEmail = raw.toLowerCase().trim();
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
  score: number; // 0-4
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

export function getTodayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
