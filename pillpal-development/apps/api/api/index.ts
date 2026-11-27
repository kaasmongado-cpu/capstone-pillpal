import type { IncomingMessage, ServerResponse } from "node:http";
import { handleApiRequest } from "../src/app.js";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await handleApiRequest(req, res);
}
