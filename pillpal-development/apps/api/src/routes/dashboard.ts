import type { IncomingMessage, ServerResponse } from "node:http";
import { prisma } from "@pillpal/database";
import { getAuthenticatedUser } from "../services/auth.js";
import { getActivityLogs } from "../services/activity-log.js";

function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: unknown,
): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(data));
}

export async function dashboardRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      sendJson(res, 401, { message: "Authentication required." });
      return;
    }

    const token = authHeader.slice(7);
    const user = await getAuthenticatedUser(token);

    if (!user || user.role !== "ADMIN") {
      sendJson(res, 403, { message: "Administrator access required." });
      return;
    }

    if (req.method === "GET") {
      const [
        totalProviders,
        totalDoctors,
        totalStaff,
        activeProviders,
        inactiveProviders,
        recentActivityData,
        unreadNotificationsCount,
      ] = await Promise.all([
        prisma.user.count({
          where: {
            role: { in: ["DOCTOR", "HEALTH_STAFF"] },
          },
        }),
        prisma.user.count({
          where: {
            role: "DOCTOR",
          },
        }),
        prisma.user.count({
          where: {
            role: "HEALTH_STAFF",
          },
        }),
        prisma.user.count({
          where: {
            role: { in: ["DOCTOR", "HEALTH_STAFF"] },
            status: "ACTIVE",
          },
        }),
        prisma.user.count({
          where: {
            role: { in: ["DOCTOR", "HEALTH_STAFF"] },
            status: "INACTIVE",
          },
        }),
        getActivityLogs(5, 0),
        prisma.adminNotification.count({
          where: { isRead: false },
        }),
      ]);

      sendJson(res, 200, {
        stats: {
          totalProviders,
          totalDoctors,
          totalStaff,
          activeProviders,
          inactiveProviders,
          unreadNotificationsCount,
        },
        recentActivities: recentActivityData.logs,
      });
      return;
    }

    sendJson(res, 405, { message: "Method not allowed." });
  } catch (error) {
    console.error("Dashboard route error:", error);
    sendJson(res, 500, { message: "Failed to fetch dashboard metrics." });
  }
}
