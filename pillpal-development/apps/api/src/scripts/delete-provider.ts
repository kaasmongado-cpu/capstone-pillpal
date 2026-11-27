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
  const args = process.argv.slice(2);
  const targetEmail = args.find((a) => !a.startsWith("--"))?.toLowerCase().trim();
  const isListOnly = args.includes("--list");
  const isAll = args.includes("--all");

  console.log("\n🏥 PILLPAL Healthcare Provider Cleanup Tool");
  console.log("==========================================");

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
    process.exit(0);
  }

  console.log(`\nFound ${providers.length} healthcare provider(s):`);
  providers.forEach((p, idx) => {
    console.log(
      `  ${idx + 1}. ${p.firstName} ${p.lastName} <${p.email}> | Role: ${p.role} | Work ID: ${p.workId ?? "N/A"} | Status: ${p.status}`,
    );
  });

  if (isListOnly || (!targetEmail && !isAll)) {
    console.log("\nUsage:");
    console.log("  npm run provider:list --workspace=api");
    console.log("  npm run provider:delete --workspace=api -- doctor@csu.edu.ph");
    console.log("  npm run provider:delete --workspace=api -- --all\n");
    process.exit(0);
  }

  console.log("\nDeleting provider(s) and cascading Better Auth sessions/accounts...");
  for (const provider of providers) {
    await prisma.user.delete({ where: { id: provider.id } });
    console.log(`  ✅ Deleted ${provider.firstName} ${provider.lastName} <${provider.email}>`);
  }

  console.log("\n✨ Provider cleanup complete!\n");
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
