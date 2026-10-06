import { prisma } from "@pillpal/database";

export type NotificationType = "INFO" | "SUCCESS" | "WARNING" | "ALERT";

export type CreateNotificationInput = {
  userId?: string | null;
  type?: NotificationType;
  title: string;
  message: string;
};

export async function createNotification(input: CreateNotificationInput) {
  try {
    return await prisma.adminNotification.create({
      data: {
        userId: input.userId ?? null,
        type: input.type ?? "INFO",
        title: input.title,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("Failed to create admin notification:", error);
    return null;
  }
}

export async function getNotifications(limit = 50, offset = 0) {
  const [notifications, unreadCount, total] = await Promise.all([
    prisma.adminNotification.findMany({
      take: limit,
      skip: offset,
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.adminNotification.count({
      where: {
        isRead: false,
      },
    }),
    prisma.adminNotification.count(),
  ]);

  return {
    notifications,
    unreadCount,
    total,
    limit,
    offset,
  };
}

export async function markNotificationAsRead(id: string): Promise<unknown> {
  return prisma.adminNotification.update({
    where: { id },
    data: { isRead: true },
  });
}

export async function markAllNotificationsAsRead(): Promise<{ count: number }> {
  return prisma.adminNotification.updateMany({
    where: { isRead: false },
    data: { isRead: true },
  });
}
