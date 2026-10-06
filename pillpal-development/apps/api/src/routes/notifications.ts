import type { IncomingMessage, ServerResponse } from "node:http";
import { getAuthenticatedUser } from "../services/auth.js";
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../services/notifications.js";

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

export async function notificationsRoute(
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

    const url = new URL(req.url ?? "/", "http://localhost");

    // GET /notifications
    if (req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);

      const result = await getNotifications(limit, offset);
      sendJson(res, 200, result);
      return;
    }

    // PATCH /notifications/read-all
    if (req.method === "PATCH" && url.pathname === "/notifications/read-all") {
      await markAllNotificationsAsRead();
      sendJson(res, 200, { message: "All notifications marked as read." });
      return;
    }

    // PATCH /notifications/:id/read
    const match = url.pathname.match(/^\/notifications\/([^/]+)\/read$/);
    if (req.method === "PATCH" && match?.[1]) {
      const notificationId = match[1];
      const updated = await markNotificationAsRead(notificationId);
      sendJson(res, 200, {
        message: "Notification marked as read.",
        notification: updated,
      });
      return;
    }

    sendJson(res, 404, { message: "Notification route not found." });
  } catch (error) {
    console.error("Notifications route error:", error);
    sendJson(res, 500, { message: "Failed to process notifications request." });
  }
}
