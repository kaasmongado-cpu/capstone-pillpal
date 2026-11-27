import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { prisma } from "@pillpal/database";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

async function cleanPatients() {
  console.log("🧹 Starting cleanup of patient records...");

  const [
    adherenceLogsCount,
    prescriptionsCount,
    appointmentsCount,
    messagesCount,
    conversationsCount,
    patientProfilesCount,
    patientUsersCount,
  ] = await Promise.all([
    prisma.adherenceLog.count(),
    prisma.prescription.count(),
    prisma.appointment.count(),
    prisma.message.count(),
    prisma.conversation.count(),
    prisma.patientProfile.count(),
    prisma.user.count({ where: { role: "PATIENT" } }),
  ]);

  console.log(`Found before cleanup:
- ${adherenceLogsCount} Adherence Logs
- ${prescriptionsCount} Prescriptions
- ${appointmentsCount} Appointments
- ${messagesCount} Messages
- ${conversationsCount} Conversations
- ${patientProfilesCount} Patient Profiles
- ${patientUsersCount} Patient Users`);

  // Delete in proper dependency order
  const deletedLogs = await prisma.adherenceLog.deleteMany({});
  console.log(`✓ Deleted ${deletedLogs.count} adherence logs.`);

  const deletedPrescriptions = await prisma.prescription.deleteMany({});
  console.log(`✓ Deleted ${deletedPrescriptions.count} prescriptions.`);

  const deletedAppointments = await prisma.appointment.deleteMany({});
  console.log(`✓ Deleted ${deletedAppointments.count} appointments.`);

  const deletedAttachments = await prisma.messageAttachment.deleteMany({});
  console.log(`✓ Deleted ${deletedAttachments.count} message attachments.`);

  const deletedMessages = await prisma.message.deleteMany({});
  console.log(`✓ Deleted ${deletedMessages.count} messages.`);

  const deletedParticipants = await prisma.conversationParticipant.deleteMany({});
  console.log(`✓ Deleted ${deletedParticipants.count} conversation participants.`);

  const deletedConversations = await prisma.conversation.deleteMany({});
  console.log(`✓ Deleted ${deletedConversations.count} conversations.`);

  const deletedProfiles = await prisma.patientProfile.deleteMany({});
  console.log(`✓ Deleted ${deletedProfiles.count} patient profiles.`);

  const deletedUsers = await prisma.user.deleteMany({
    where: { role: "PATIENT" },
  });
  console.log(`✓ Deleted ${deletedUsers.count} patient user accounts.`);

  // Verify remaining provider/admin users
  const remainingProviders = await prisma.user.count({
    where: { role: { in: ["ADMIN", "DOCTOR", "HEALTH_STAFF"] } },
  });

  console.log(`\n✨ Patient database cleanup complete!`);
  console.log(`🛡️ ${remainingProviders} Admin & Healthcare Provider accounts remain safe and active.`);
}

cleanPatients()
  .catch((e) => {
    console.error("❌ Cleanup failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
