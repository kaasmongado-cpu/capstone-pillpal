import { prisma } from "@pillpal/database";

export async function getProvider(id: string) {
  return prisma.user.findFirst({
    where: {
      id,
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
  });
}