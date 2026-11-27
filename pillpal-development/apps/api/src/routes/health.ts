import type { IncomingMessage, ServerResponse } from "node:http";

export function healthRoute(
  _req: IncomingMessage,
  res: ServerResponse,
): void {
  res.writeHead(200, {
    "Content-Type": "application/json",
  });

  res.end(
    JSON.stringify({
      status: "ok",
      service: "PILLPAL API",
      databaseConfigured: Boolean((process.env.DATABASE_URL || "").trim()),
      authUrlConfigured: Boolean((process.env.BETTER_AUTH_URL || "").trim()),
    }),
  );
}