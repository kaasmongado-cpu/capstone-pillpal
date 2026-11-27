import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { prisma } from "@pillpal/database";
import { auth } from "../lib/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

const DEFAULT_PASSWORD = process.env.MIGRATION_DEFAULT_PASSWORD || "Password123!";

async function main() {
  console.log("🔐 Migrating existing Neon DB users to Better Auth credential accounts...");

  const users = await prisma.user.findMany({
    include: { accounts: true },
  });

  if (users.length === 0) {
    console.log("No users found in Neon DB.");
    return;
  }

  const ctx = await auth.$context;
  const hashedPassword = await ctx.password.hash(DEFAULT_PASSWORD);

  let migrated = 0;
  let skipped = 0;

  for (const user of users) {
    const fullName =
      user.name && user.name.trim().length > 0
        ? user.name
        : `${user.firstName} ${user.lastName}`.trim() || user.email.split("@")[0] || "PILLPAL User";

    // Ensure name & emailVerified = true for pre-existing users
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: fullName,
        emailVerified: true,
      },
    });

    const existingCredentialAccount = user.accounts.find(
      (acc) => acc.providerId === "credential",
    );

    if (!existingCredentialAccount) {
      await prisma.account.create({
        data: {
          accountId: user.id,
          providerId: "credential",
          userId: user.id,
          password: hashedPassword,
        },
      });
      console.log(`  ✅ Migrated [${user.role}] ${user.email} (password: ${DEFAULT_PASSWORD})`);
      migrated++;
    } else if (existingCredentialAccount.accountId !== user.id) {
      await prisma.account.update({
        where: { id: existingCredentialAccount.id },
        data: { accountId: user.id },
      });
      console.log(`  🔧 Fixed accountId for [${user.role}] ${user.email}`);
      migrated++;
    } else {
      console.log(`  ℹ️  Already migrated [${user.role}] ${user.email}`);
      skipped++;
    }
  }

  console.log(`\n✨ Better Auth migration complete: ${migrated} migrated, ${skipped} already ready.`);
}

main()
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
