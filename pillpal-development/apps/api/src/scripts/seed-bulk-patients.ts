import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  prisma,
  type AdherenceStatus,
  type AppointmentStatus,
  type MedicationStatus,
  type UserType,
} from "@pillpal/database";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env first, then apps/api/.env (matching server.ts)
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const SEED_EMAIL_PREFIX = "seed.patient.";
const SEED_EMAIL_DOMAIN = "@carsu.edu.ph";

// Deterministic PRNG (Mulberry32) so runs are reproducible unless --random is passed
function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES_FEMALE = [
  "Maria", "Angela", "Camille", "Patricia", "Bea", "Sophia", "Clarissa", "Hannah",
  "Katrina", "Bianca", "Nicole", "Jessa", "Alyssa", "Mikaela", "Christine", "Rica",
  "Denise", "Erica", "Joyce", "Shiela", "Lorraine", "Janine", "Trisha", "Maricel",
  "Giselle", "Charmaine", "Ailene", "Precious", "Kyla", "Mariel", "Pauline", "Sheena",
  "Grace", "Faith", "Joy", "Abigail", "Andrea", "Celine", "Danielle", "Elaine",
  "Faye", "Hazel", "Irene", "Joanna", "Kimberly", "Leah", "Mae", "Nadine",
  "Olivia", "Princess", "Queenie", "Rachel", "Samantha", "Trixie", "Vanessa", "Wendy",
  "Yasmine", "Zoe", "Liza", "Margarita", "Roselyn", "Teresita", "Evelyn", "Corazon",
];

const FIRST_NAMES_MALE = [
  "Juan", "Joshua", "Mark", "Christian", "John", "Angelo", "Kevin", "Kenneth",
  "Carlo", "Miguel", "Rafael", "Daniel", "Gabriel", "Jerome", "Patrick", "Ryan",
  "Bryan", "Francis", "Paolo", "Adrian", "Alvin", "Arjay", "Benedict", "Cedric",
  "Daryl", "Dennis", "Edgar", "Emmanuel", "Ferdinand", "Gerald", "Harold", "Ian",
  "Jayson", "Jeric", "Joel", "Joseph", "Julius", "Karl", "Lance", "Lawrence",
  "Lester", "Lloyd", "Marco", "Marvin", "Michael", "Nathaniel", "Neil", "Noel",
  "Oliver", "Paul", "Ramon", "Renzo", "Rey", "Richard", "Robert", "Rodel",
  "Ronald", "Samuel", "Stephen", "Timothy", "Victor", "Vincent", "Wilfredo", "Zander",
];

const LAST_NAMES = [
  "Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza", "Torres",
  "Tomas", "Andres", "Marquez", "Castillo", "Flores", "Rivera", "Aquino", "Ramos",
  "De Guzman", "Dela Cruz", "Villanueva", "Fernandez", "Gomez", "Gonzales", "Lopez", "Perez",
  "Sanchez", "Ramirez", "Morales", "Soriano", "Navarro", "Salazar", "Alvarez", "Diaz",
  "Manalo", "Mercado", "Pascual", "Santiago", "Valdez", "Velasco", "Corpuz", "Domingo",
  "Estrada", "Galang", "Herrera", "Ignacio", "Javier", "Lagman", "Lim", "Macaraeg",
  "Magno", "Miranda", "Natividad", "Ortega", "Padilla", "Pineda", "Quintero", "Robles",
  "Rosales", "Sarmiento", "Tolentino", "Uy", "Vargas", "Vergara", "Ybanez", "Zamora",
  "Abad", "Agbayani", "Alcantara", "Alegre", "Alonzo", "Amador", "Arce", "Arenas",
  "Balagtas", "Balanay", "Balingit", "Baluyot", "Banez", "Barrios", "Basilio", "Beltran",
  "Bernardo", "Buenaventura", "Caballero", "Cabrera", "Cagampang", "Calderon", "Camacho", "Canlas",
  "Capistrano", "Carreon", "Casas", "Catacutan", "Cordero", "Cuenca", "Dalisay", "Dizon",
];

const STUDENT_COLLEGES = [
  "College of Computing and Information Sciences",
  "College of Engineering and Geosciences",
  "College of Education",
  "College of Humanities and Social Sciences",
  "College of Mathematics and Natural Sciences",
  "College of Agricultural and Agri-Industries",
  "College of Forestry and Environmental Sciences",
];

const EMPLOYEE_UNITS = [
  "College of Computing and Information Sciences (Faculty)",
  "College of Engineering and Geosciences (Faculty)",
  "College of Education (Faculty)",
  "College of Humanities and Social Sciences (Faculty)",
  "College of Mathematics and Natural Sciences (Faculty)",
  "College of Agricultural and Agri-Industries (Faculty)",
  "College of Forestry and Environmental Sciences (Faculty)",
  "Office of the University President",
  "Office of Student Affairs and Services",
  "Human Resource Management Office",
  "University Registrar's Office",
  "Finance and Accounting Office",
  "University Library Services",
  "Campus Facilities and General Services",
  "Research, Innovation and Extension Office",
];

const BLOOD_TYPES = ["O+", "O+", "O+", "A+", "A+", "B+", "B+", "AB+", "O-", "A-", "B-"];

const ALLERGY_OPTIONS: Array<{ label: string; avoidDrugs: string[] }> = [
  { label: "None known", avoidDrugs: [] },
  { label: "None known", avoidDrugs: [] },
  { label: "None known", avoidDrugs: [] },
  { label: "None known", avoidDrugs: [] },
  { label: "None known", avoidDrugs: [] },
  { label: "None known", avoidDrugs: [] },
  { label: "Penicillin", avoidDrugs: ["Amoxicillin"] },
  { label: "NSAIDs (Ibuprofen, Aspirin)", avoidDrugs: ["Ibuprofen", "Mefenamic Acid"] },
  { label: "Sulfa drugs", avoidDrugs: ["Co-trimoxazole"] },
  { label: "Dust mites & pollen", avoidDrugs: [] },
  { label: "Shellfish", avoidDrugs: [] },
  { label: "Cephalosporins", avoidDrugs: ["Cefalexin"] },
];

const STUDENT_CONDITIONS = [
  "None",
  "None",
  "None",
  "Allergic Rhinitis",
  "Bronchial Asthma",
  "Upper Respiratory Tract Infection",
  "Iron Deficiency Anemia",
  "Gastritis / Acid Reflux (GERD)",
  "Migraine Headaches",
  "Acute Tonsillopharyngitis",
  "Seasonal Viral Fever",
];

const EMPLOYEE_CONDITIONS = [
  "None",
  "None",
  "Stage 1 Hypertension",
  "Essential Hypertension",
  "Type 2 Diabetes Mellitus",
  "Dyslipidemia",
  "Type 2 Diabetes, Mild Hypertension",
  "Bronchial Asthma",
  "Gastroesophageal Reflux Disease (GERD)",
  "Allergic Rhinitis",
  "Osteoarthritis / Joint Pain",
];

interface MedicationTemplate {
  name: string;
  dosage: string;
  form: string;
  frequency: string;
  scheduleTimes: string[];
  instructions: string;
  shortCourseDays?: number;
  selfScannedEligible?: boolean;
  forConditions?: string[];
}

const MEDICATION_CATALOG: MedicationTemplate[] = [
  {
    name: "Amoxicillin",
    dosage: "500 mg",
    form: "Capsule",
    frequency: "Three times daily",
    scheduleTimes: ["08:00 AM", "02:00 PM", "08:00 PM"],
    instructions: "Take every 8 hours with water. Complete full antibiotic course.",
    shortCourseDays: 7,
  },
  {
    name: "Paracetamol",
    dosage: "500 mg",
    form: "Tablet",
    frequency: "Twice daily as needed",
    scheduleTimes: ["08:00 AM", "08:00 PM"],
    instructions: "Take after meals for fever or mild headache.",
    shortCourseDays: 5,
    selfScannedEligible: true,
  },
  {
    name: "Ibuprofen",
    dosage: "200 mg",
    form: "Softgel",
    frequency: "Twice daily",
    scheduleTimes: ["08:00 AM", "06:00 PM"],
    instructions: "Take with food to prevent stomach upset.",
    shortCourseDays: 5,
    selfScannedEligible: true,
  },
  {
    name: "Cetirizine Hydrochloride",
    dosage: "10 mg",
    form: "Tablet",
    frequency: "Once daily bedtime",
    scheduleTimes: ["09:00 PM"],
    instructions: "May cause mild drowsiness. Take at night for allergy symptoms.",
    shortCourseDays: 10,
    selfScannedEligible: true,
    forConditions: ["Allergic Rhinitis"],
  },
  {
    name: "Salbutamol Inhaler",
    dosage: "100 mcg",
    form: "Inhaler",
    frequency: "Twice daily & PRN",
    scheduleTimes: ["07:00 AM", "07:00 PM"],
    instructions: "2 puffs twice daily or as needed for shortness of breath.",
    forConditions: ["Bronchial Asthma"],
  },
  {
    name: "Amlodipine Besylate",
    dosage: "10 mg",
    form: "Tablet",
    frequency: "Once daily morning",
    scheduleTimes: ["08:00 AM"],
    instructions: "Take 1 tablet every morning with water. Monitor blood pressure.",
    forConditions: ["Stage 1 Hypertension", "Essential Hypertension", "Type 2 Diabetes, Mild Hypertension"],
  },
  {
    name: "Losartan",
    dosage: "50 mg",
    form: "Tablet",
    frequency: "Once daily morning",
    scheduleTimes: ["08:00 AM"],
    instructions: "Take 1 tablet in the morning after breakfast.",
    forConditions: ["Stage 1 Hypertension", "Essential Hypertension"],
  },
  {
    name: "Metformin Hydrochloride",
    dosage: "500 mg",
    form: "Tablet",
    frequency: "Twice daily",
    scheduleTimes: ["08:00 AM", "06:00 PM"],
    instructions: "Take with morning and evening meals to minimize GI discomfort.",
    forConditions: ["Type 2 Diabetes Mellitus", "Type 2 Diabetes, Mild Hypertension"],
  },
  {
    name: "Atorvastatin",
    dosage: "20 mg",
    form: "Tablet",
    frequency: "Once daily bedtime",
    scheduleTimes: ["09:00 PM"],
    instructions: "Take 1 tablet at bedtime. Maintain low-cholesterol diet.",
    forConditions: ["Dyslipidemia"],
  },
  {
    name: "Omeprazole",
    dosage: "20 mg",
    form: "Capsule",
    frequency: "Once daily before breakfast",
    scheduleTimes: ["07:00 AM"],
    instructions: "Take 30 minutes before breakfast.",
    shortCourseDays: 14,
    forConditions: ["Gastritis / Acid Reflux (GERD)", "Gastroesophageal Reflux Disease (GERD)"],
  },
  {
    name: "Ferrous Sulfate",
    dosage: "325 mg",
    form: "Tablet",
    frequency: "Once daily",
    scheduleTimes: ["12:00 PM"],
    instructions: "Take with Vitamin C or orange juice to improve iron absorption.",
    forConditions: ["Iron Deficiency Anemia"],
  },
  {
    name: "Azithromycin",
    dosage: "500 mg",
    form: "Tablet",
    frequency: "Once daily",
    scheduleTimes: ["08:00 AM"],
    instructions: "Take once daily at the same time each day. Finish 5-day course.",
    shortCourseDays: 5,
  },
  {
    name: "Ascorbic Acid + Zinc",
    dosage: "500 mg / 10 mg",
    form: "Capsule",
    frequency: "Once daily morning",
    scheduleTimes: ["08:00 AM"],
    instructions: "Daily immune support supplement after breakfast.",
    selfScannedEligible: true,
  },
  {
    name: "Levocetirizine",
    dosage: "5 mg",
    form: "Tablet",
    frequency: "Once daily evening",
    scheduleTimes: ["08:00 PM"],
    instructions: "Take 1 tablet in the evening for allergic rhinitis relief.",
    shortCourseDays: 14,
    selfScannedEligible: true,
    forConditions: ["Allergic Rhinitis"],
  },
  {
    name: "Lagundi Leaf",
    dosage: "600 mg",
    form: "Tablet",
    frequency: "Three times daily",
    scheduleTimes: ["08:00 AM", "01:00 PM", "07:00 PM"],
    instructions: "Herbal cough relief. Take with plenty of warm water.",
    shortCourseDays: 7,
    selfScannedEligible: true,
  },
];

const CONSULTATION_REASONS = [
  "Fever and flu-like symptoms",
  "Persistent cough and throat irritation",
  "Prescription refill & regimen review",
  "Routine blood pressure monitoring",
  "Allergic rhinitis flare-up",
  "Asthma follow-up and peak flow check",
  "Headache and dizziness during class",
  "Epigastric pain / acid reflux consultation",
  "Annual medical clearance / physical exam",
  "Blood glucose monitoring & dietary counseling",
  "Medication side effects consultation",
  "Fatigue and anemia follow-up",
  "Sprain / minor campus sports injury",
  "Dysmenorrhea / abdominal discomfort",
  "General wellness checkup",
];

const CLINICAL_SOAP_NOTES = [
  "S: Patient reports symptom improvement over the past 3 days. O: BP 120/80 mmHg, PR 74 bpm, Temp 36.6°C, SpO2 99%. Lungs clear. A: Stable clinical course. P: Continue prescribed regimen, encourage oral hydration, follow up if symptoms worsen.",
  "S: Presents with mild fever and dry cough for 2 days. O: Temp 37.8°C, BP 110/70 mmHg, erythematous pharynx without exudates. A: Acute viral URTI. P: Prescribed symptomatic relief, rest advised, return to clinic in 3 days if febrile.",
  "S: Follow-up for blood pressure control; reports good medication compliance. O: BP 128/82 mmHg, PR 70 bpm. Regular heart sounds. A: Controlled Stage 1 HTN. P: Renewed maintenance prescription for 30 days; low-sodium diet reinforced.",
  "S: Intermittent wheezing triggered by campus dust. O: SpO2 98%, mild end-expiratory wheezes bilaterally. A: Mild intermittent bronchial asthma. P: Reviewed inhaler technique, reinforced rescue inhaler availability.",
  "S: Requests medical clearance and prescription review. O: Vitals within normal limits (BP 116/76, PR 72, Temp 36.5°C). A: Fit for regular academic/work duties. P: Cleared; continue current maintenance medications.",
  "S: Epigastric burning after skipped meals. O: Soft abdomen, mild epigastric tenderness, no guarding. A: Acid peptic disease / GERD. P: Started PPI course before breakfast; advised regular meals and avoiding caffeine.",
  "S: Follow-up Hb/fatigue check; taking iron supplements regularly. O: Conjunctivae pink, BP 112/70, PR 76. A: Improving iron deficiency anemia. P: Continue Ferrous Sulfate with Vitamin C; repeat CBC next month.",
  "S: Sneezing and nasal congestion in the morning. O: Pale boggy nasal turbinates, clear rhinorrhea, afebrile. A: Allergic rhinitis. P: Advised evening antihistamine and allergen avoidance.",
];

const SKIP_REASONS = [
  "Forgot / Away from medicine",
  "Busy with classes / campus duty",
  "Experiencing mild stomach upset",
  "Medication supply ran out",
  "Felt better and skipped dose",
];

const CANCELLATION_REASONS = [
  "Schedule conflict with laboratory class",
  "Symptoms resolved prior to appointment",
  "Rescheduling to next clinic weekday",
  "Off-campus official travel",
];

const REJECTION_REASONS = [
  "Requested slot fully booked; please pick next available morning slot",
  "Duplicate booking detected for the same date",
];

const CLINIC_HOURS = [
  { h: 8, m: 30 },
  { h: 9, m: 30 },
  { h: 10, m: 30 },
  { h: 11, m: 15 },
  { h: 13, m: 30 },
  { h: 14, m: 30 },
  { h: 15, m: 30 },
];

function parseTimeSlot(baseDate: Date, timeStr: string): Date {
  const d = new Date(baseDate);
  const parts = timeStr.trim().split(" ");
  const [hRaw = "8", mRaw = "0"] = (parts[0] || "08:00").split(":");
  let h = parseInt(hRaw, 10);
  const m = parseInt(mRaw, 10);
  const mer = (parts[1] || "").toUpperCase();
  if (mer === "PM" && h < 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  d.setHours(h, m, 0, 0);
  return d;
}

function shiftToWeekday(base: Date, dayOffset: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  const dow = d.getDay();
  if (dow === 0) d.setDate(d.getDate() + (dayOffset >= 0 ? 1 : -2));
  else if (dow === 6) d.setDate(d.getDate() + (dayOffset >= 0 ? 2 : -1));
  return d;
}

async function insertInChunks<T>(
  label: string,
  items: T[],
  chunkSize: number,
  runner: (chunk: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await runner(chunk);
  }
  console.log(`   ✓ Inserted ${items.length.toLocaleString()} ${label}`);
}

async function main() {
  const args = process.argv.slice(2);
  const isReset = args.includes("--reset");
  const isDryRun = args.includes("--dry-run");
  const isRandomSeed = args.includes("--random");
  const countArg = args.find((a) => a.startsWith("--count="));
  const targetCount = countArg ? Math.max(1, parseInt(countArg.split("=")[1] || "500", 10)) : 500;

  const rng = createRng(isRandomSeed ? Date.now() : 20261127);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]!;
  const randInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;

  console.log(
    `🌱 CSU PillPal Bulk Patient Seeder (count=${targetCount}${isReset ? ", reset" : ""}${isDryRun ? ", dry-run" : ""})`,
  );

  // 1. Optional reset of previously seeded mock patients ONLY (never touches real accounts)
  if (isReset && !isDryRun) {
    const deleted = await prisma.user.deleteMany({
      where: {
        email: {
          startsWith: SEED_EMAIL_PREFIX,
          endsWith: SEED_EMAIL_DOMAIN,
        },
        role: "PATIENT",
      },
    });
    console.log(`🧹 Cleared ${deleted.count} previously seeded patient accounts (cascaded).`);
  }

  // 2. Discover existing doctors & health staff for realistic assignment
  const [doctors, staffMembers] = await Promise.all([
    prisma.user.findMany({
      where: { role: "DOCTOR", status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.user.findMany({
      where: { role: { in: ["HEALTH_STAFF", "ADMIN"] }, status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const fallbackProviders =
    doctors.length > 0
      ? doctors
      : await prisma.user.findMany({
          where: { role: { in: ["DOCTOR", "HEALTH_STAFF", "ADMIN"] } },
          select: { id: true, firstName: true, lastName: true },
        });

  console.log(
    `👩‍⚕️ Clinicians found: ${doctors.length} Doctor(s), ${staffMembers.length} Health Staff/Admin(s)`,
  );

  // Check existing seeded emails so rerunning without --reset safely skips existing patients
  const existingSeeded = await prisma.user.findMany({
    where: {
      email: {
        startsWith: SEED_EMAIL_PREFIX,
        endsWith: SEED_EMAIL_DOMAIN,
      },
    },
    select: { email: true },
  });
  const existingEmails = new Set(existingSeeded.map((u) => u.email));

  const now = new Date();
  const studentTarget = Math.round(targetCount * 0.75); // 375 Students, 125 Employees for 500

  const usersToCreate: Array<{
    id: string;
    supabaseUserId: string;
    name: string;
    email: string;
    emailVerified: boolean;
    firstName: string;
    lastName: string;
    phone: string;
    role: "PATIENT";
    userType: UserType;
    status: "ACTIVE";
  }> = [];

  const profilesToCreate: Array<{
    id: string;
    userId: string;
    idNumber: string;
    department: string;
    dateOfBirth: Date;
    gender: string;
    bloodType: string;
    allergies: string;
    medicalConditions: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    privacyConsentAt: Date;
  }> = [];

  const prescriptionsToCreate: Array<{
    id: string;
    patientId: string;
    doctorId: string | null;
    name: string;
    dosage: string;
    form: string;
    instructions: string;
    frequency: string;
    scheduleTimes: string[];
    startDate: Date;
    endDate: Date | null;
    status: MedicationStatus;
  }> = [];

  const adherenceLogsToCreate: Array<{
    id: string;
    patientId: string;
    prescriptionId: string;
    scheduledTime: Date;
    takenTime: Date | null;
    status: AdherenceStatus;
    notes: string | null;
  }> = [];

  const appointmentsToCreate: Array<{
    id: string;
    patientId: string;
    providerId: string | null;
    confirmedById: string | null;
    scheduledAt: Date;
    requestedDate: Date;
    reason: string;
    type: "IN_PERSON";
    status: AppointmentStatus;
    patientNotes: string | null;
    clinicalNotes: string | null;
    rejectionReason: string | null;
    cancellationReason: string | null;
    checkedInAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
  }> = [];

  let studentCount = 0;
  let employeeCount = 0;
  let skippedExisting = 0;

  for (let i = 1; i <= targetCount; i++) {
    const padded = String(i).padStart(3, "0");
    const email = `${SEED_EMAIL_PREFIX}${padded}${SEED_EMAIL_DOMAIN}`;

    if (existingEmails.has(email)) {
      skippedExisting++;
      continue;
    }

    const isStudent = i <= studentTarget;
    if (isStudent) studentCount++;
    else employeeCount++;

    const isFemale = rng() < 0.54;
    const firstName = isFemale ? pick(FIRST_NAMES_FEMALE) : pick(FIRST_NAMES_MALE);
    const lastName = pick(LAST_NAMES);
    const fullName = `${firstName} ${lastName}`;

    const userId = `seed_usr_${padded}_${crypto.randomBytes(4).toString("hex")}`;
    const profileId = `seed_pat_${padded}_${crypto.randomBytes(4).toString("hex")}`;

    const idNumber = isStudent
      ? `${pick(["221", "222", "223", "224", "225"])}-${String(10000 + i)}`
      : `EMP-${randInt(2014, 2025)}-${String(i - studentTarget).padStart(4, "0")}`;

    const department = isStudent ? pick(STUDENT_COLLEGES) : pick(EMPLOYEE_UNITS);
    const age = isStudent ? randInt(18, 24) : randInt(25, 62);
    const dob = new Date(
      now.getFullYear() - age,
      randInt(0, 11),
      randInt(1, 28),
    );

    const allergyChoice = pick(ALLERGY_OPTIONS);
    const condition = isStudent ? pick(STUDENT_CONDITIONS) : pick(EMPLOYEE_CONDITIONS);
    const emergencyFirst = pick(rng() < 0.5 ? FIRST_NAMES_FEMALE : FIRST_NAMES_MALE);
    const emergencyRelation = isStudent
      ? pick(["Mother", "Father", "Sister", "Brother", "Guardian"])
      : pick(["Spouse", "Sister", "Brother", "Parent", "Colleague"]);

    const phone = `+63 9${randInt(15, 99)} ${randInt(100, 999)} ${randInt(1000, 9999)}`;
    const emergencyPhone = `+63 9${randInt(15, 99)} ${randInt(100, 999)} ${randInt(1000, 9999)}`;

    usersToCreate.push({
      id: userId,
      supabaseUserId: `csu-seed-${padded}`,
      name: fullName,
      email,
      emailVerified: true,
      firstName,
      lastName,
      phone,
      role: "PATIENT",
      userType: isStudent ? "STUDENT" : "EMPLOYEE",
      status: "ACTIVE",
    });

    profilesToCreate.push({
      id: profileId,
      userId,
      idNumber,
      department,
      dateOfBirth: dob,
      gender: isFemale ? "Female" : "Male",
      bloodType: pick(BLOOD_TYPES),
      allergies: allergyChoice.label,
      medicalConditions: condition,
      emergencyContactName: `${emergencyFirst} ${lastName} (${emergencyRelation})`,
      emergencyContactPhone: emergencyPhone,
      privacyConsentAt: new Date(now.getTime() - randInt(10, 180) * 86400_000),
    });

    // --- MEDICATIONS & ADHERENCE LOGS ---
    // ~85% of patients have 1 to 3 medications; ~15% have consultation-only records
    const medRoll = rng();
    const medCount = medRoll < 0.15 ? 0 : medRoll < 0.62 ? 1 : medRoll < 0.9 ? 2 : 3;

    // Choose allergy-safe medications, prioritizing condition-matched drugs
    const safeCatalog = MEDICATION_CATALOG.filter(
      (m) => !allergyChoice.avoidDrugs.includes(m.name),
    );
    const matchedMeds = safeCatalog.filter((m) => m.forConditions?.includes(condition));
    const chosenMeds: MedicationTemplate[] = [];

    for (let mIdx = 0; mIdx < medCount; mIdx++) {
      let candidate: MedicationTemplate | undefined;
      if (mIdx === 0 && matchedMeds.length > 0) {
        candidate = pick(matchedMeds);
      } else {
        const remaining = safeCatalog.filter(
          (m) => !chosenMeds.some((c) => c.name === m.name),
        );
        if (remaining.length === 0) break;
        candidate = pick(remaining);
      }
      if (candidate) chosenMeds.push(candidate);
    }

    // Patient adherence personality tier (On-Track ~65%, Warning ~22%, Critical ~13%)
    const tierRoll = rng();
    const adherenceTarget =
      tierRoll < 0.65
        ? 0.88 + rng() * 0.11 // 88–99%
        : tierRoll < 0.87
          ? 0.65 + rng() * 0.18 // 65–83%
          : 0.25 + rng() * 0.32; // 25–57%

    for (const med of chosenMeds) {
      const rxId = `seed_rx_${padded}_${crypto.randomBytes(4).toString("hex")}`;
      const isSelfScanned = Boolean(med.selfScannedEligible) && rng() < 0.24;
      const assignedDoctor =
        !isSelfScanned && fallbackProviders.length > 0 ? pick(fallbackProviders) : null;

      const statusRoll = rng();
      const rxStatus: MedicationStatus =
        statusRoll < 0.72
          ? "ACTIVE"
          : statusRoll < 0.88
            ? "COMPLETED"
            : statusRoll < 0.95
              ? "PAUSED"
              : "DISCONTINUED";

      const daysAgoStarted = randInt(5, 28);
      const startDate = new Date(now.getTime() - daysAgoStarted * 86400_000);
      let endDate: Date | null = null;

      if (rxStatus === "COMPLETED") {
        endDate = new Date(now.getTime() - randInt(1, Math.min(4, daysAgoStarted - 1)) * 86400_000);
      } else if (med.shortCourseDays) {
        const computedEnd = new Date(startDate.getTime() + med.shortCourseDays * 86400_000);
        // Keep active short-course meds ending 1–7 days in the future
        endDate =
          computedEnd > now
            ? computedEnd
            : new Date(now.getTime() + randInt(1, 7) * 86400_000);
      }

      prescriptionsToCreate.push({
        id: rxId,
        patientId: profileId,
        doctorId: assignedDoctor?.id ?? null,
        name: med.name,
        dosage: med.dosage,
        form: med.form,
        instructions: med.instructions,
        frequency: med.frequency,
        scheduleTimes: med.scheduleTimes,
        startDate,
        endDate,
        status: rxStatus,
      });

      // Seed 5–10 days of adherence logs for ACTIVE and COMPLETED regimens
      if (rxStatus === "ACTIVE" || rxStatus === "COMPLETED") {
        const logDays = Math.min(daysAgoStarted, randInt(4, 10));
        for (let dayBack = logDays; dayBack >= 1; dayBack--) {
          const dayDate = new Date(now);
          dayDate.setDate(dayDate.getDate() - dayBack);

          for (const slot of med.scheduleTimes) {
            const scheduled = parseTimeSlot(dayDate, slot);
            if (scheduled >= now) continue;

            const roll = rng();
            let logStatus: AdherenceStatus;
            let takenTime: Date | null = null;
            let notes: string | null = null;

            if (roll < adherenceTarget) {
              logStatus = "TAKEN";
              // Most taken doses within ±25 min, some delayed up to 65 min
              const offsetMinutes =
                rng() < 0.74 ? randInt(-15, 25) : randInt(31, 65);
              takenTime = new Date(scheduled.getTime() + offsetMinutes * 60_000);
              notes = rng() < 0.5 ? "Logged via Mobile App" : "Logged via Patient Portal";
            } else if (roll < adherenceTarget + (1 - adherenceTarget) * 0.45) {
              logStatus = "SKIPPED";
              notes = pick(SKIP_REASONS);
            } else {
              logStatus = "MISSED";
              notes = "Auto-flagged overdue dose";
            }

            adherenceLogsToCreate.push({
              id: `seed_adh_${crypto.randomBytes(6).toString("hex")}`,
              patientId: profileId,
              prescriptionId: rxId,
              scheduledTime: scheduled,
              takenTime,
              status: logStatus,
              notes,
            });
          }
        }
      }
    }

    // --- CONSULTATIONS & APPOINTMENTS (1 to 3 per patient, all IN_PERSON CSU Infirmary) ---
    const apptCount = rng() < 0.25 ? 1 : rng() < 0.78 ? 2 : 3;
    for (let aIdx = 0; aIdx < apptCount; aIdx++) {
      const slot = pick(CLINIC_HOURS);
      const assignedDoctor = fallbackProviders.length > 0 ? pick(fallbackProviders) : null;
      const confirmedBy = staffMembers.length > 0 ? pick(staffMembers) : assignedDoctor;
      const reason = pick(CONSULTATION_REASONS);

      // Weighted appointment lifecycle states:
      // 48% COMPLETED (past consultations with SOAP notes), 16% CONFIRMED (upcoming),
      // 14% PENDING (triage queue), 8% CANCELLED, 5% NO_SHOW, 4% REJECTED,
      // 3% WAITING (today lobby), 2% IN_PROGRESS (today consult)
      const sRoll = rng();
      let status: AppointmentStatus;
      let scheduledAt: Date;
      let checkedInAt: Date | null = null;
      let startedAt: Date | null = null;
      let completedAt: Date | null = null;
      let clinicalNotes: string | null = null;
      let cancellationReason: string | null = null;
      let rejectionReason: string | null = null;
      let providerId: string | null = assignedDoctor?.id ?? null;
      let confirmedById: string | null = confirmedBy?.id ?? null;

      if (sRoll < 0.48) {
        status = "COMPLETED";
        scheduledAt = shiftToWeekday(now, -randInt(1, 35));
        scheduledAt.setHours(slot.h, slot.m, 0, 0);
        checkedInAt = new Date(scheduledAt.getTime() - randInt(5, 15) * 60_000);
        startedAt = new Date(scheduledAt.getTime() + randInt(0, 8) * 60_000);
        completedAt = new Date(startedAt.getTime() + randInt(15, 30) * 60_000);
        clinicalNotes = pick(CLINICAL_SOAP_NOTES);
      } else if (sRoll < 0.64) {
        status = "CONFIRMED";
        scheduledAt = shiftToWeekday(now, randInt(1, 14));
        scheduledAt.setHours(slot.h, slot.m, 0, 0);
      } else if (sRoll < 0.78) {
        status = "PENDING";
        scheduledAt = shiftToWeekday(now, randInt(1, 14));
        scheduledAt.setHours(slot.h, slot.m, 0, 0);
        providerId = null;
        confirmedById = null;
      } else if (sRoll < 0.86) {
        status = "CANCELLED";
        scheduledAt = shiftToWeekday(now, randInt(-14, 7));
        scheduledAt.setHours(slot.h, slot.m, 0, 0);
        cancellationReason = pick(CANCELLATION_REASONS);
      } else if (sRoll < 0.91) {
        status = "NO_SHOW";
        scheduledAt = shiftToWeekday(now, -randInt(1, 20));
        scheduledAt.setHours(slot.h, slot.m, 0, 0);
      } else if (sRoll < 0.95) {
        status = "REJECTED";
        scheduledAt = shiftToWeekday(now, randInt(-7, 7));
        scheduledAt.setHours(slot.h, slot.m, 0, 0);
        providerId = null;
        rejectionReason = pick(REJECTION_REASONS);
      } else if (sRoll < 0.98) {
        status = "WAITING";
        scheduledAt = new Date(now);
        scheduledAt.setHours(slot.h, slot.m, 0, 0);
        checkedInAt = new Date(now.getTime() - randInt(5, 25) * 60_000);
      } else {
        status = "IN_PROGRESS";
        scheduledAt = new Date(now);
        scheduledAt.setHours(slot.h, slot.m, 0, 0);
        checkedInAt = new Date(now.getTime() - randInt(15, 35) * 60_000);
        startedAt = new Date(now.getTime() - randInt(3, 12) * 60_000);
      }

      appointmentsToCreate.push({
        id: `seed_apt_${crypto.randomBytes(6).toString("hex")}`,
        patientId: profileId,
        providerId,
        confirmedById,
        scheduledAt,
        requestedDate: scheduledAt,
        reason,
        type: "IN_PERSON",
        status,
        patientNotes:
          rng() < 0.55
            ? pick([
                "Prefer morning visit before afternoon classes.",
                "Bringing previous prescription slip for review.",
                "Symptoms started 2 days ago.",
                "Requesting follow-up checkup and clearance.",
              ])
            : null,
        clinicalNotes,
        rejectionReason,
        cancellationReason,
        checkedInAt,
        startedAt,
        completedAt,
      });
    }
  }

  console.log("\n📊 Seed Dataset Summary:");
  console.log(`   • New Patients:       ${usersToCreate.length} (${studentCount} Students, ${employeeCount} Employees)`);
  if (skippedExisting > 0) {
    console.log(`   • Already Seeded:     ${skippedExisting} skipped (pass --reset to recreate)`);
  }
  console.log(`   • Prescriptions:      ${prescriptionsToCreate.length}`);
  console.log(`   • Adherence Logs:     ${adherenceLogsToCreate.length}`);
  console.log(`   • Consultations/Appt: ${appointmentsToCreate.length}`);

  if (isDryRun) {
    console.log("\n✅ Dry run complete — no database writes performed.");
    return;
  }

  if (usersToCreate.length === 0) {
    console.log("\nℹ️ All seeded patients already exist. Use `--reset` to regenerate them.");
    return;
  }

  console.log("\n🚀 Writing batches to PostgreSQL...");
  const startedAt = Date.now();

  await insertInChunks("users", usersToCreate, 250, (chunk) =>
    prisma.user.createMany({ data: chunk, skipDuplicates: true }),
  );
  await insertInChunks("patient profiles", profilesToCreate, 250, (chunk) =>
    prisma.patientProfile.createMany({ data: chunk, skipDuplicates: true }),
  );
  await insertInChunks("prescriptions", prescriptionsToCreate, 250, (chunk) =>
    prisma.prescription.createMany({ data: chunk, skipDuplicates: true }),
  );
  await insertInChunks("adherence logs", adherenceLogsToCreate, 500, (chunk) =>
    prisma.adherenceLog.createMany({ data: chunk, skipDuplicates: true }),
  );
  await insertInChunks("appointments & consultations", appointmentsToCreate, 250, (chunk) =>
    prisma.appointment.createMany({ data: chunk, skipDuplicates: true }),
  );

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(`\n🎉 Bulk seeding finished in ${elapsedSec}s!`);
}

main()
  .catch((err) => {
    console.error("❌ Bulk patient seeding failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
