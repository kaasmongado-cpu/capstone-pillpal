import type { IncomingMessage } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { prisma } from "@pillpal/database";
import { auth } from "../lib/auth.js";

/**
 * Resolve the authenticated PillPal User (with patientProfile) from either:
 * - A raw Bearer access token string, OR
 * - A Node.js IncomingMessage (supports Authorization: Bearer <token> or session cookies)
 */
export async function getAuthenticatedUser(
  tokenOrReq: string | IncomingMessage,
) {
  let headers: Headers;

  if (typeof tokenOrReq === "string") {
    const cleanToken = tokenOrReq.replace(/^Bearer\s+/i, "").trim();
    if (!cleanToken) {
      return null;
    }
    headers = new Headers({
      authorization: `Bearer ${cleanToken}`,
    });
  } else {
    headers = fromNodeHeaders(tokenOrReq.headers);
  }

  try {
    const session = await auth.api.getSession({ headers });

    if (!session?.user?.id) {
      return null;
    }

    const pillpalUser = await prisma.user.findUnique({
      where: {
        id: session.user.id,
      },
      include: {
        patientProfile: true,
      },
    });

    return pillpalUser;
  } catch (err) {
    console.error("getAuthenticatedUser error:", err);
    return null;
  }
}
