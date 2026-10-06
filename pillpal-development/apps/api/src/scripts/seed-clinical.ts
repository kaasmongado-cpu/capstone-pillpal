import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { prisma } from "@pillpal/database";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

async function main() {
  console.log("🌱 Seeding clinical data for CSU Healthcare Portal...");

  // 1. Find a doctor in DB or find the first provider
  let doctor = await prisma.user.findFirst({
    where: { role: "DOCTOR" },
  });

  if (!doctor) {
    doctor = await prisma.user.findFirst({
      where: { role: { in: ["DOCTOR", "HEALTH_STAFF", "ADMIN"] } },
    });
  }

  const doctorId = doctor ? doctor.id : undefined;
  console.log(`Assigned Doctor for prescriptions: ${doctor ? `${doctor.firstName} ${doctor.lastName} (${doctor.role})` : "None"}`);

  // 2. Patient datasets
  const patientsData = [
    {
      supabaseUserId: "csu-patient-maria-santos",
      email: "maria.santos@carsu.edu.ph",
      firstName: "Maria",
      lastName: "Santos",
      phone: "+63 917 123 4567",
      userType: "STUDENT" as const,
      idNumber: "2022-04912",
      department: "College of Nursing",
      gender: "Female",
      bloodType: "O+",
      allergies: "Penicillin",
      medicalConditions: "Type 2 Diabetes, Mild Hypertension",
      emergencyContactName: "Teresa Santos (Mother)",
      emergencyContactPhone: "+63 917 987 6543",
      prescriptions: [
        {
          name: "Metformin",
          dosage: "500 mg",
          form: "Tablet",
          instructions: "Take 1 tablet twice daily with meals",
          frequency: "Twice daily",
          scheduleTimes: ["08:00 AM", "06:00 PM"],
        },
      ],
      adherencePattern: "low", // ~65%
    },
    {
      supabaseUserId: "csu-patient-juan-delacruz",
      email: "juan.delacruz@carsu.edu.ph",
      firstName: "Juan",
      lastName: "Dela Cruz",
      phone: "+63 918 234 5678",
      userType: "STUDENT" as const,
      idNumber: "2021-08123",
      department: "College of Engineering and Geosciences",
      gender: "Male",
      bloodType: "A+",
      allergies: "None known",
      medicalConditions: "Stage 1 Hypertension",
      emergencyContactName: "Pedro Dela Cruz (Father)",
      emergencyContactPhone: "+63 918 876 5432",
      prescriptions: [
        {
          name: "Amlodipine",
          dosage: "10 mg",
          form: "Tablet",
          instructions: "Take 1 tablet every morning with water",
          frequency: "Once daily morning",
          scheduleTimes: ["08:00 AM"],
        },
      ],
      adherencePattern: "medium", // ~75%
    },
    {
      supabaseUserId: "csu-patient-angela-reyes",
      email: "angela.reyes@carsu.edu.ph",
      firstName: "Angela",
      lastName: "Reyes",
      phone: "+63 919 345 6789",
      userType: "STUDENT" as const,
      idNumber: "2023-01045",
      department: "College of Education",
      gender: "Female",
      bloodType: "B+",
      allergies: "Dust Mites, Sulfa drugs",
      medicalConditions: "Bronchial Asthma",
      emergencyContactName: "Rosita Reyes (Mother)",
      emergencyContactPhone: "+63 919 765 4321",
      prescriptions: [
        {
          name: "Salbutamol Inhaler",
          dosage: "100 mcg",
          form: "Inhaler",
          instructions: "2 puffs twice daily or upon asthma triggers",
          frequency: "Twice daily & PRN",
          scheduleTimes: ["07:00 AM", "07:00 PM"],
        },
      ],
      adherencePattern: "medium-high", // ~85%
    },
    {
      supabaseUserId: "csu-patient-ricardo-dizon",
      email: "ricardo.dizon@carsu.edu.ph",
      firstName: "Ricardo",
      lastName: "Dizon",
      phone: "+63 920 456 7890",
      userType: "EMPLOYEE" as const,
      idNumber: "EMP-2018-092",
      department: "College of Science and Mathematics",
      gender: "Male",
      bloodType: "AB+",
      allergies: "NSAIDs (Aspirin, Ibuprofen)",
      medicalConditions: "Dyslipidemia, Essential Hypertension",
      emergencyContactName: "Carmen Dizon (Spouse)",
      emergencyContactPhone: "+63 920 654 3210",
      prescriptions: [
        {
          name: "Atorvastatin",
          dosage: "20 mg",
          form: "Tablet",
          instructions: "Take 1 tablet at bedtime",
          frequency: "Once daily bedtime",
          scheduleTimes: ["09:00 PM"],
        },
        {
          name: "Losartan",
          dosage: "50 mg",
          form: "Tablet",
          instructions: "Take 1 tablet in the morning after breakfast",
          frequency: "Once daily morning",
          scheduleTimes: ["08:00 AM"],
        },
      ],
      adherencePattern: "high", // 95%
    },
    {
      supabaseUserId: "csu-patient-elena-bautista",
      email: "elena.bautista@carsu.edu.ph",
      firstName: "Elena",
      lastName: "Bautista",
      phone: "+63 921 567 8901",
      userType: "EMPLOYEE" as const,
      idNumber: "EMP-2015-034",
      department: "College of Information Technology",
      gender: "Female",
      bloodType: "O+",
      allergies: "None",
      medicalConditions: "Type 2 Diabetes Mellitus",
      emergencyContactName: "Marco Bautista (Spouse)",
      emergencyContactPhone: "+63 921 543 2109",
      prescriptions: [
        {
          name: "Empagliflozin",
          dosage: "10 mg",
          form: "Tablet",
          instructions: "Take 1 tablet every morning with or without food",
          frequency: "Once daily morning",
          scheduleTimes: ["08:00 AM"],
        },
      ],
      adherencePattern: "high", // 96%
    },
    {
      supabaseUserId: "csu-patient-joshua-garcia",
      email: "joshua.garcia@carsu.edu.ph",
      firstName: "Joshua",
      lastName: "Garcia",
      phone: "+63 922 678 9012",
      userType: "STUDENT" as const,
      idNumber: "2024-00192",
      department: "College of Agriculture and Forestry",
      gender: "Male",
      bloodType: "O-",
      allergies: "None",
      medicalConditions: "Iron Deficiency Anemia",
      emergencyContactName: "Ana Garcia (Sister)",
      emergencyContactPhone: "+63 922 432 1098",
      prescriptions: [
        {
          name: "Ferrous Sulfate",
          dosage: "325 mg",
          form: "Tablet",
          instructions: "Take 1 tablet daily with orange juice or meal",
          frequency: "Once daily",
          scheduleTimes: ["12:00 PM"],
        },
      ],
      adherencePattern: "high", // 90%
    },
  ];

  for (const p of patientsData) {
    // Create or update User
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        userType: p.userType,
        role: "PATIENT",
        status: "ACTIVE",
      },
      create: {
        supabaseUserId: p.supabaseUserId,
        email: p.email,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        userType: p.userType,
        role: "PATIENT",
        status: "ACTIVE",
      },
    });

    // Create or update PatientProfile
    const profile = await prisma.patientProfile.upsert({
      where: { userId: user.id },
      update: {
        idNumber: p.idNumber,
        department: p.department,
        gender: p.gender,
        bloodType: p.bloodType,
        allergies: p.allergies,
        medicalConditions: p.medicalConditions,
        emergencyContactName: p.emergencyContactName,
        emergencyContactPhone: p.emergencyContactPhone,
      },
      create: {
        userId: user.id,
        idNumber: p.idNumber,
        department: p.department,
        gender: p.gender,
        bloodType: p.bloodType,
        allergies: p.allergies,
        medicalConditions: p.medicalConditions,
        emergencyContactName: p.emergencyContactName,
        emergencyContactPhone: p.emergencyContactPhone,
      },
    });

    console.log(`✓ Seeded patient: ${p.firstName} ${p.lastName} (${p.idNumber})`);

    // Create Prescriptions & Adherence Logs
    for (const rx of p.prescriptions) {
      let prescription = await prisma.prescription.findFirst({
        where: {
          patientId: profile.id,
          name: rx.name,
        },
      });

      if (!prescription) {
        prescription = await prisma.prescription.create({
          data: {
            patientId: profile.id,
            doctorId: doctorId ?? null,
            name: rx.name,
            dosage: rx.dosage,
            form: rx.form,
            instructions: rx.instructions,
            frequency: rx.frequency,
            scheduleTimes: rx.scheduleTimes,
            startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
            status: "ACTIVE",
          },
        });
      }

      // Seed 7 days of adherence logs
      const existingLogsCount = await prisma.adherenceLog.count({
        where: { prescriptionId: prescription.id },
      });

      if (existingLogsCount === 0) {
        for (let day = 7; day >= 1; day--) {
          for (const timeStr of rx.scheduleTimes) {
            const scheduled = new Date();
            scheduled.setDate(scheduled.getDate() - day);
            const timeComponents = timeStr.split(" ");
            const timeNumbers = (timeComponents[0] || "08:00").split(":");
            const hoursPart = timeNumbers[0] || "8";
            const minPart = timeNumbers[1] || "00";
            let h = parseInt(hoursPart, 10);
            if (timeStr.includes("PM") && h < 12) h += 12;
            if (timeStr.includes("AM") && h === 12) h = 0;
            scheduled.setHours(h, parseInt(minPart, 10), 0, 0);

            // Determine status based on pattern
            let status: "TAKEN" | "MISSED" | "SKIPPED" = "TAKEN";
            if (p.adherencePattern === "low") {
              // Misses about 35% of doses
              if (day === 1 || day === 3 || day === 5) status = "MISSED";
            } else if (p.adherencePattern === "medium") {
              // Misses about 25% of doses
              if (day === 2 || day === 6) status = "MISSED";
            } else if (p.adherencePattern === "medium-high") {
              if (day === 4) status = "MISSED";
            }

            await prisma.adherenceLog.create({
              data: {
                patientId: profile.id,
                prescriptionId: prescription.id,
                scheduledTime: scheduled,
                takenTime: status === "TAKEN" ? new Date(scheduled.getTime() + 15 * 60 * 1000) : null,
                status,
                notes: status === "MISSED" ? "Patient reported forgetting dose" : "Confirmed on mobile",
              },
            });
          }
        }
      }
    }
  }

  // 3. Appointments
  const today = new Date();
  const maria = await prisma.patientProfile.findFirst({ where: { idNumber: "2022-04912" } });
  const juan = await prisma.patientProfile.findFirst({ where: { idNumber: "2021-08123" } });
  const angela = await prisma.patientProfile.findFirst({ where: { idNumber: "2023-01045" } });
  const ricardo = await prisma.patientProfile.findFirst({ where: { idNumber: "EMP-2018-092" } });

  const appointmentsData = [
    {
      patientId: maria?.id,
      timeOffsetHours: 1,
      reason: "Fasting Blood Sugar & Medication Review",
      type: "IN_PERSON" as const,
      status: "CONFIRMED" as const,
    },
    {
      patientId: juan?.id,
      timeOffsetHours: 3,
      reason: "Blood Pressure Monitoring & Refill",
      type: "IN_PERSON" as const,
      status: "CONFIRMED" as const,
    },
    {
      patientId: angela?.id,
      timeOffsetHours: 5,
      reason: "Asthma Peak Flow & Inhaler Technique Check",
      type: "TELEHEALTH" as const,
      status: "CONFIRMED" as const,
    },
    {
      patientId: ricardo?.id,
      timeOffsetHours: 26, // Tomorrow
      reason: "Annual Health Profile & Lipid Panel Follow-up",
      type: "IN_PERSON" as const,
      status: "CONFIRMED" as const,
    },
  ];

  for (const apt of appointmentsData) {
    if (!apt.patientId) continue;
    const existing = await prisma.appointment.findFirst({
      where: {
        patientId: apt.patientId,
        reason: apt.reason,
      },
    });

    if (!existing) {
      const scheduledAt = new Date(today.getTime() + apt.timeOffsetHours * 60 * 60 * 1000);
      await prisma.appointment.create({
        data: {
          patientId: apt.patientId,
          providerId: doctorId ?? null,
          scheduledAt,
          reason: apt.reason,
          type: apt.type,
          status: apt.status,
        },
      });
      console.log(`✓ Seeded appointment: ${apt.reason}`);
    }
  }

  console.log("🎉 Clinical data seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
