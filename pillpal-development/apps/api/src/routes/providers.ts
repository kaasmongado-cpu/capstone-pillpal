import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { prisma } from "@pillpal/database";

import {
  createProvider,
  type CreateProviderInput,
} from "../services/providers/create-provider.js";
import { getProviders } from "../services/providers/get-providers.js";
import { getProvider } from "../services/providers/get-provider.js";
import {
  updateProvider,
  type UpdateProviderInput,
} from "../services/providers/update-provider.js";
import {
  updateProviderStatus,
  type ProviderAccountStatus,
} from "../services/providers/update-provider-status.js";
import { getAuthenticatedUser } from "../services/auth.js";
import { logActivity } from "../services/activity-log.js";
import { createNotification } from "../services/notifications.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load apps/api/.env
dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL");
}

if (!supabasePublishableKey) {
  throw new Error(
    "Missing SUPABASE_PUBLISHABLE_KEY",
  );
}

const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
);

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

async function readRequestBody<T>(
  req: IncomingMessage,
): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  return JSON.parse(
    Buffer.concat(chunks).toString("utf-8"),
  ) as T;
}

async function authenticateAdmin(
  req: IncomingMessage,
) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const accessToken = authorization.slice(7);
  const user = await getAuthenticatedUser(accessToken);

  if (!user || user.role !== "ADMIN") {
    return null;
  }

  return user;
}

function getProviderId(
  url: string | undefined,
): string | null {
  if (!url) {
    return null;
  }

  const match = url.match(
    /^\/providers\/([^/]+)$/,
  );

  return match?.[1] ?? null;
}

function isStatusRoute(
  url: string | undefined,
): boolean {
  return /^\/providers\/[^/]+\/status$/.test(
    url ?? "",
  );
}

function getProviderIdFromStatusRoute(
  url: string | undefined,
): string | null {
  if (!url) {
    return null;
  }

  const match = url.match(
    /^\/providers\/([^/]+)\/status$/,
  );

  return match?.[1] ?? null;
}

export async function providersRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const admin = await authenticateAdmin(req);

    if (!admin) {
      sendJson(res, 403, {
        message:
          "Administrator access is required.",
      });

      return;
    }

    /*
     * GET /providers
     *
     * Get all healthcare providers.
     */
    if (
      req.method === "GET" &&
      req.url === "/providers"
    ) {
      const providers = await getProviders();

      sendJson(res, 200, {
        providers,
      });

      return;
    }

    /*
     * POST /providers
     *
     * Create a healthcare provider.
     */
    if (
      req.method === "POST" &&
      req.url === "/providers"
    ) {
      const body =
        await readRequestBody<CreateProviderInput>(
          req,
        );

      const provider =
        await createProvider(body);

      const roleLabel = provider.role === "DOCTOR" ? "Doctor" : "Health Staff";

      await logActivity({
        adminId: admin.id,
        action: "PROVIDER_INVITED",
        details: `${admin.firstName} ${admin.lastName} invited ${roleLabel} ${provider.firstName} ${provider.lastName} (${provider.email}).`,
        targetId: provider.id,
        targetType: "PROVIDER",
      });

      await createNotification({
        type: "INFO",
        title: "New Provider Invited",
        message: `${roleLabel} ${provider.firstName} ${provider.lastName} was invited to join PILLPAL.`,
      });

      sendJson(res, 201, {
        message:
          "Healthcare provider account created successfully.",
        provider: {
          id: provider.id,
          email: provider.email,
          firstName: provider.firstName,
          lastName: provider.lastName,
          phone: provider.phone,
          workId: provider.workId,
          specialization:
            provider.specialization,
          role: provider.role,
          userType: provider.userType,
          status: provider.status,
        },
      });

      return;
    }

    /*
     * PATCH /providers/:id/status
     *
     * Activate or deactivate a provider.
     */
    if (
      req.method === "PATCH" &&
      isStatusRoute(req.url)
    ) {
      const providerId =
        getProviderIdFromStatusRoute(req.url);

      if (!providerId) {
        sendJson(res, 400, {
          message:
            "Provider ID is required.",
        });

        return;
      }

      const body =
        await readRequestBody<{
          status: ProviderAccountStatus;
        }>(req);

      const provider =
        await updateProviderStatus(
          providerId,
          body.status,
        );

      const statusAction = provider.status === "ACTIVE" ? "PROVIDER_ACTIVATED" : "PROVIDER_DEACTIVATED";
      const statusLabel = provider.status === "ACTIVE" ? "activated" : "deactivated";

      await logActivity({
        adminId: admin.id,
        action: statusAction,
        details: `${admin.firstName} ${admin.lastName} ${statusLabel} account for ${provider.firstName} ${provider.lastName} (${provider.workId ?? provider.email}).`,
        targetId: provider.id,
        targetType: "PROVIDER",
      });

      await createNotification({
        type: provider.status === "ACTIVE" ? "SUCCESS" : "WARNING",
        title: `Provider Account ${provider.status === "ACTIVE" ? "Activated" : "Deactivated"}`,
        message: `${provider.firstName} ${provider.lastName}'s account is now ${provider.status.toLowerCase()}.`,
      });

      sendJson(res, 200, {
        message:
          `Provider account ${provider.status === "ACTIVE" ? "activated" : "deactivated"} successfully.`,
        provider,
      });

      return;
    }

    /*
     * GET /providers/:id
     *
     * Get one healthcare provider.
     */
    if (
      req.method === "GET" &&
      getProviderId(req.url)
    ) {
      const providerId =
        getProviderId(req.url);

      if (!providerId) {
        sendJson(res, 400, {
          message:
            "Provider ID is required.",
        });

        return;
      }

      const provider =
        await getProvider(providerId);

      if (!provider) {
        sendJson(res, 404, {
          message:
            "Healthcare provider not found.",
        });

        return;
      }

      sendJson(res, 200, {
        provider,
      });

      return;
    }

    /*
     * PUT /providers/:id
     *
     * Update provider information.
     */
    if (
      req.method === "PUT" &&
      getProviderId(req.url)
    ) {
      const providerId =
        getProviderId(req.url);

      if (!providerId) {
        sendJson(res, 400, {
          message:
            "Provider ID is required.",
        });

        return;
      }

      const body =
        await readRequestBody<UpdateProviderInput>(
          req,
        );

      const provider =
        await updateProvider(
          providerId,
          body,
        );

      await logActivity({
        adminId: admin.id,
        action: "PROVIDER_UPDATED",
        details: `${admin.firstName} ${admin.lastName} updated profile information for ${provider.firstName} ${provider.lastName}.`,
        targetId: provider.id,
        targetType: "PROVIDER",
      });

      sendJson(res, 200, {
        message:
          "Healthcare provider updated successfully.",
        provider,
      });

      return;
    }

    sendJson(res, 404, {
      message: "Provider route not found.",
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(res, 400, {
        message: "Invalid JSON request body.",
      });

      return;
    }

    if (error instanceof Error) {
      const validationErrors = [
        "First name, last name, email, password, work ID, and provider role are required.",
        "Provider role must be DOCTOR or HEALTH_STAFF.",
        "Password must be at least 8 characters.",
        "Specialization is required for doctors.",
        "A PILLPAL account with this email already exists.",
        "A provider with this Work ID already exists.",
        "Healthcare provider not found.",
        "First name cannot be empty.",
        "Last name cannot be empty.",
        "Email cannot be empty.",
        "Work ID cannot be empty.",
        "Account status must be ACTIVE or INACTIVE.",
      ];

      if (validationErrors.includes(error.message)) {
        sendJson(res, 400, {
          message: error.message,
        });

        return;
      }
    }

    console.error(
      "Provider route failed:",
      error,
    );

    sendJson(res, 500, {
      message:
        "Unable to process the provider request.",
    });
  }
}