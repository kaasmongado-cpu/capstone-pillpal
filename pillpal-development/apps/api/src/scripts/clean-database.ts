import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { prisma } from "@pillpal/database";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../../../.env"),
});
dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

async function main() {
  console.log("🧹 Cleaning PILLPAL database (Patients, Healthcare Providers, Clinical Records)...");

  const nonAdminUsers = await prisma.user.findMany({
    where: { role: { in: ["PATIENT", "DOCTOR", "HEALTH_STAFF"] } },
    select: { id: true, email: true, role: true },
  });
  const nonAdminIds = nonAdminUsers.map((u) => u.id);

  // 1. Delete dependent clinical, messaging, and transaction records in FK order
  const [
    delLogs,
    delRx,
    delAppts,
    delAttach,
    delMsgs,
    delParts,
    delConvos,
    delInvTx,
    delVerif,
    delProfiles,
  ] = await Promise.all([
    prisma.adherenceLog.deleteMany({}),
    prisma.prescription.deleteMany({}),
    prisma.appointment.deleteMany({}),
    prisma.messageAttachment.deleteMany({}),
    prisma.message.deleteMany({}),
    prisma.conversationParticipant.deleteMany({}),
    prisma.conversation.deleteMany({}),
    prisma.inventoryTransaction.deleteMany({}),
    prisma.verification.deleteMany({}),
    prisma.patientProfile.deleteMany({}),
  ]);

  // Delete notifications & activity logs tied to non-admin users (or old provider events)
  const delNotifs = await prisma.adminNotification.deleteMany({
    where: { userId: { in: nonAdminIds } },
  });
  const delActivities = await prisma.activityLog.deleteMany({
    where: { adminId: { in: nonAdminIds } },
  });

  // 2. Delete all PATIENT, DOCTOR, and HEALTH_STAFF users (cascades Session & Account)
  const delUsers = await prisma.user.deleteMany({
    where: { role: { in: ["PATIENT", "DOCTOR", "HEALTH_STAFF"] } },
  });

  // 3. Report remaining accounts
  const remainingUsers = await prisma.user.findMany({
    select: { email: true, role: true, firstName: true, lastName: true },
  });
  const remainingInventory = await prisma.inventoryItem.count();

  console.log(`
✓ Deleted ${delLogs.count} adherence logs
✓ Deleted ${delRx.count} prescriptions
✓ Deleted ${delAppts.count} appointments
✓ Deleted ${delMsgs.count} messages & ${delConvos.count} conversations (${delAttach.count} attachments, ${delParts.count} participants)
✓ Deleted ${delInvTx.count} inventory transactions
✓ Deleted ${delVerif.count} verification / OTP / invite tokens
✓ Deleted ${delProfiles.count} patient profiles
✓ Deleted ${delNotifs.count} user notifications & ${delActivities.count} activity logs
✓ Deleted ${delUsers.count} user accounts (Patients + Doctors + Health Staff):
${nonAdminUsers.map((u) => `   - [${u.role}] ${u.email}`).join("\n") || "   (none)"}

🛡️ Preserved ${remainingUsers.length} Admin account(s):
${remainingUsers.map((u) => `   - [${u.role}] ${u.firstName} ${u.lastName} <${u.email}>`).join("\n")}
📦 Preserved ${remainingInventory} clinic medicine inventory item(s).
`);
}

main()
  .catch((err) => {
    console.error("❌ Cleanup failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
