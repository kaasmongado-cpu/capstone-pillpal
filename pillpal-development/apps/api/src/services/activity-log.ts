import { prisma } from "@pillpal/database";

export type LogActivityInput = {
  adminId?: string | null;
  action: string;
  details: string;
  targetId?: string | null;
  targetType?: string | null;
};

export async function logActivity(input: LogActivityInput) {
  try {
    return await prisma.activityLog.create({
      data: {
        adminId: input.adminId ?? null,
        action: input.action,
        details: input.details,
        targetId: input.targetId ?? null,
        targetType: input.targetType ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to write activity log:", error);
    return null;
  }
}

export async function getActivityLogs(limit = 50, offset = 0) {
  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      take: limit,
      skip: offset,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        admin: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
      },
    }),
    prisma.activityLog.count(),
  ]);

  return {
    logs,
    total,
    limit,
    offset,
  };
}
