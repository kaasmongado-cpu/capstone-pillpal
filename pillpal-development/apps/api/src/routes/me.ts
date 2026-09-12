import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";

import { getAuthenticatedUser } from "../services/auth.js";

export async function meRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const authorization =
    req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    res.writeHead(401, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        message: "Authentication required",
      }),
    );

    return;
  }

  const accessToken = authorization.slice(7);

  const user = await getAuthenticatedUser(
    accessToken,
  );

  if (!user) {
    res.writeHead(401, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        message: "Invalid authentication",
      }),
    );

    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/json",
  });

  res.end(
    JSON.stringify({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      userType: user.userType,
    }),
  );
}