import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";

import { prisma } from "@pillpal/database";

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

export async function adminSetupStatusRoute(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const existingAdmin = await prisma.user.findFirst({
      where: {
        role: "ADMIN",
      },
      select: {
        id: true,
      },
    });

    sendJson(res, 200, {
      setupRequired: !existingAdmin,
    });
  } catch (error) {
    console.error(
      "Admin setup status check failed:",
      error,
    );

    sendJson(res, 500, {
      message:
        "Unable to check admin setup status.",
    });
  }
}