import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@pillpal/database";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function main() {
  const args = process.argv.slice(2);
  const targetEmail = args.find((a) => !a.startsWith("--"))?.toLowerCase().trim();
  const isListOnly = args.includes("--list");
  const isAll = args.includes("--all");

  console.log("\n🏥 PILLPAL Healthcare Provider Cleanup Tool");
  console.log("==========================================");

  // 1. Fetch all healthcare providers in the database
  const providers = await prisma.user.findMany({
    where: targetEmail
      ? {
          email: targetEmail,
          role: { in: ["DOCTOR", "HEALTH_STAFF"] },
        }
      : {
          role: { in: ["DOCTOR", "HEALTH_STAFF"] },
        },
    select: {
      id: true,
      supabaseUserId: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      workId: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (providers.length === 0) {
    if (targetEmail) {
      console.log(`ℹ️  No healthcare provider found with email: "${targetEmail}"`);
    } else {
      console.log("ℹ️  No healthcare providers found in the database.");
    }

    // Also check if an orphaned user exists in Supabase Auth by email
    if (targetEmail) {
      const { data } = await supabase.auth.admin.listUsers();
      const authUser = data.users.find((u) => u.email?.toLowerCase() === targetEmail);
      if (authUser) {
        console.log(`⚠️  Found orphaned user in Supabase Auth (${authUser.id}). Deleting from Supabase...`);
        await supabase.auth.admin.deleteUser(authUser.id);
        console.log(`✅ Removed ${targetEmail} from Supabase Auth.`);
      }
    }

    process.exit(0);
  }

  console.log(`\nFound ${providers.length} healthcare provider(s):`);
  providers.forEach((p, idx) => {
    console.log(
      `  [${idx + 1}] ${p.role} - ${p.firstName} ${p.lastName} (${p.email}) | Work ID: ${p.workId || "N/A"} | Status: ${p.status}`
    );
  });

  if (isListOnly) {
    console.log("\n(--list mode: No records deleted)");
    process.exit(0);
  }

  if (!targetEmail && !isAll) {
    console.log("\n⚠️  To delete a provider, specify their email or pass --all:");
    console.log("   npm run provider:delete -- doctor@csu.edu.ph");
    console.log("   npm run provider:delete -- --all");
    console.log("   npm run provider:list");
    process.exit(0);
  }

  console.log("\n🗑️  Deleting provider(s)...");

  for (const provider of providers) {
    try {
      // 1. Delete from Prisma
      await prisma.user.delete({
        where: { id: provider.id },
      });
      console.log(`  ✓ Deleted from PostgreSQL Database: ${provider.email}`);

      // 2. Delete from Supabase Auth
      if (provider.supabaseUserId) {
        const { error: authError } = await supabase.auth.admin.deleteUser(
          provider.supabaseUserId
        );
        if (authError) {
          console.log(`  ⚠️  Supabase Auth delete notice (${provider.email}): ${authError.message}`);
        } else {
          console.log(`  ✓ Deleted from Supabase Auth: ${provider.email}`);
        }
      }
    } catch (err: any) {
      console.error(`  ❌ Error deleting ${provider.email}:`, err.message || err);
    }
  }

  console.log("\n✅ Provider cleanup completed successfully.");
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
