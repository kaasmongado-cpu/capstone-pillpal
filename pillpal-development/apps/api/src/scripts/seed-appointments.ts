import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { prisma } from "@pillpal/database";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

async function seedAppointments() {
  console.log("🏥 Seeding CSU Clinical Appointments & Triage Requests...");

  // Find Patients
  const patients = await prisma.patientProfile.findMany({
    include: { user: true },
  });

  if (patients.length === 0) {
    console.error("❌ No patients found. Please register or seed patients first.");
    return;
  }

  // Find Doctor
  const doctor = await prisma.user.findFirst({
    where: { role: "DOCTOR" },
  });

  // Find Health Staff
  const healthStaff = await prisma.user.findFirst({
    where: { role: "HEALTH_STAFF" },
  });

  console.log(`Found ${patients.length} patients, Doctor: ${doctor?.firstName || "None"}, Staff: ${healthStaff?.firstName || "None"}`);

  const today = new Date();
  const today9am = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0, 0);
  const today1030am = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 30, 0);
  const today1115am = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 11, 15, 0);
  const today2pm = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 0, 0);
  const tomorrow10am = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 10, 0, 0);
  const yesterday2pm = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 14, 0, 0);

  // Clear existing appointments to start fresh with clean test data
  await prisma.appointment.deleteMany({});

  const getPatientId = (index: number) => {
    const p = patients[Math.min(index, patients.length - 1)];
    if (!p) throw new Error("Patient not found");
    return p.id;
  };

  const sampleAppointments = [
    // 1. PENDING Triage Request from Student (Needs Health Staff review & Doctor assignment)
    {
      patientId: getPatientId(0),
      providerId: null,
      confirmedById: null,
      scheduledAt: tomorrow10am,
      requestedDate: tomorrow10am,
      reason: "Persistent productive cough and mild fever for 3 days",
      type: "IN_PERSON" as const,
      status: "PENDING" as const,
      patientNotes: "I have classes in the afternoon, so morning is preferred. Feeling chest tightness.",
    },
    // 2. Another PENDING Request (Telehealth request)
    {
      patientId: getPatientId(1),
      providerId: null,
      confirmedById: null,
      scheduledAt: today2pm,
      requestedDate: today2pm,
      reason: "Hypertension medication renewal & dizziness checkup",
      type: "TELEHEALTH" as const,
      status: "PENDING" as const,
      patientNotes: "Currently off campus for internship. Requesting virtual consult.",
    },
    // 3. WAITING in Lobby (Checked in today, ready for Doctor)
    {
      patientId: getPatientId(2),
      providerId: doctor?.id || null,
      confirmedById: healthStaff?.id || null,
      scheduledAt: today9am,
      requestedDate: today9am,
      reason: "Follow-up blood pressure check & prescription refill",
      type: "IN_PERSON" as const,
      status: "WAITING" as const,
      checkedInAt: new Date(Date.now() - 15 * 60 * 1000), // 15 mins ago
      patientNotes: "Brought home BP log for review.",
    },
    // 4. IN_PROGRESS (Doctor currently consulting)
    {
      patientId: getPatientId(3),
      providerId: doctor?.id || null,
      confirmedById: healthStaff?.id || null,
      scheduledAt: today1030am,
      requestedDate: today1030am,
      reason: "Asthma action plan evaluation and peak flow meter review",
      type: "IN_PERSON" as const,
      status: "IN_PROGRESS" as const,
      checkedInAt: new Date(Date.now() - 35 * 60 * 1000),
      startedAt: new Date(Date.now() - 10 * 60 * 1000),
    },
    // 5. CONFIRMED for Today (Scheduled later today)
    {
      patientId: getPatientId(4),
      providerId: doctor?.id || null,
      confirmedById: healthStaff?.id || null,
      scheduledAt: today1115am,
      requestedDate: today1115am,
      reason: "Allergic rhinitis & seasonal flare-up review",
      type: "IN_PERSON" as const,
      status: "CONFIRMED" as const,
    },
    // 6. COMPLETED Consultation with Clinical Notes
    {
      patientId: getPatientId(0),
      providerId: doctor?.id || null,
      confirmedById: healthStaff?.id || null,
      scheduledAt: yesterday2pm,
      requestedDate: yesterday2pm,
      reason: "Routine chronic condition management",
      type: "IN_PERSON" as const,
      status: "COMPLETED" as const,
      checkedInAt: new Date(yesterday2pm.getTime() - 10 * 60 * 1000),
      startedAt: yesterday2pm,
      completedAt: new Date(yesterday2pm.getTime() + 25 * 60 * 1000),
      clinicalNotes: "Patient reports good medication adherence. BP 120/80 mmHg, PR 72 bpm. Lungs clear to auscultation. Advised to maintain low sodium diet and continue daily hydration.",
    },
  ];

  for (const apt of sampleAppointments) {
    await prisma.appointment.create({
      data: apt,
    });
  }

  console.log(`✅ Successfully seeded ${sampleAppointments.length} clinical appointments across all lifecycle states.`);
}

seedAppointments()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
