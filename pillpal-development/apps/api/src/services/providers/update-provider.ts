import { prisma } from "@pillpal/database";

export type UpdateProviderInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  workId?: string;
  specialization?: string | null;
};

export async function updateProvider(
  id: string,
  input: UpdateProviderInput,
) {
  const provider = await prisma.user.findFirst({
    where: {
      id,
      role: {
        in: ["DOCTOR", "HEALTH_STAFF"],
      },
    },
    select: {
      id: true,
      role: true,
      email: true,
      workId: true,
    },
  });

  if (!provider) {
    throw new Error(
      "Healthcare provider not found.",
    );
  }

  const data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string | null;
    workId?: string;
    specialization?: string | null;
  } = {};

  if (input.firstName !== undefined) {
    const firstName = input.firstName.trim();

    if (!firstName) {
      throw new Error(
        "First name cannot be empty.",
      );
    }

    data.firstName = firstName;
  }

  if (input.lastName !== undefined) {
    const lastName = input.lastName.trim();

    if (!lastName) {
      throw new Error(
        "Last name cannot be empty.",
      );
    }

    data.lastName = lastName;
  }

  if (input.email !== undefined) {
    const email = input.email
      .trim()
      .toLowerCase();

    if (!email) {
      throw new Error(
        "Email cannot be empty.",
      );
    }

    if (email !== provider.email) {
      const existingEmail =
        await prisma.user.findUnique({
          where: {
            email,
          },
          select: {
            id: true,
          },
        });

      if (existingEmail) {
        throw new Error(
          "A PILLPAL account with this email already exists.",
        );
      }
    }

    data.email = email;
  }

  if (input.phone !== undefined) {
    data.phone =
      input.phone?.trim() || null;
  }

  if (input.workId !== undefined) {
    const workId = input.workId.trim();

    if (!workId) {
      throw new Error(
        "Work ID cannot be empty.",
      );
    }

    if (workId !== provider.workId) {
      const existingWorkId =
        await prisma.user.findFirst({
          where: {
            workId,
            NOT: {
              id,
            },
          },
          select: {
            id: true,
          },
        });

      if (existingWorkId) {
        throw new Error(
          "A provider with this Work ID already exists.",
        );
      }
    }

    data.workId = workId;
  }

  if (input.specialization !== undefined) {
    const specialization =
      input.specialization?.trim() || null;

    if (
      provider.role === "DOCTOR" &&
      !specialization
    ) {
      throw new Error(
        "Specialization is required for doctors.",
      );
    }

    data.specialization =
      provider.role === "DOCTOR"
        ? specialization
        : null;
  }

  return prisma.user.update({
    where: {
      id,
    },
    data,
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