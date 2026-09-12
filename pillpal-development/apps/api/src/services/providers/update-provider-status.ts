import { prisma } from "@pillpal/database";

export type ProviderAccountStatus =
  | "ACTIVE"
  | "INACTIVE";

export async function updateProviderStatus(
  id: string,
  status: ProviderAccountStatus,
) {
  if (
    status !== "ACTIVE" &&
    status !== "INACTIVE"
  ) {
    throw new Error(
      "Account status must be ACTIVE or INACTIVE.",
    );
  }

  const provider = await prisma.user.findFirst({
    where: {
      id,
      role: {
        in: ["DOCTOR", "HEALTH_STAFF"],
      },
    },
    select: {
      id: true,
    },
  });

  if (!provider) {
    throw new Error(
      "Healthcare provider not found.",
    );
  }

  return prisma.user.update({
    where: {
      id,
    },
    data: {
      status,
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