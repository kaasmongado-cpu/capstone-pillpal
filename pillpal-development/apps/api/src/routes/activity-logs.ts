import type { IncomingMessage, ServerResponse } from "node:http";
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

export async function activityLogsRoute(
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
      const url = new URL(req.url ?? "/", "http://localhost");
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);

      const result = await getActivityLogs(limit, offset);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 405, { message: "Method not allowed." });
  } catch (error) {
    console.error("Activity logs route error:", error);
    sendJson(res, 500, { message: "Failed to fetch activity logs." });
  }
}
