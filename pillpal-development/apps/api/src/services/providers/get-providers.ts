import { prisma } from "@pillpal/database";

export async function getProviders() {
  return prisma.user.findMany({
    where: {
      role: {
        in: ["DOCTOR", "HEALTH_STAFF"],
      },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      workId: true,
      specialization: true,
      role: true,
      userType: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}