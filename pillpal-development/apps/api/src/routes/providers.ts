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
): Promise<boolean> {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const accessToken = authorization.slice(7);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return false;
  }

  const admin = await prisma.user.findUnique({
    where: {
      supabaseUserId: user.id,
    },
    select: {
      role: true,
    },
  });

  return admin?.role === "ADMIN";
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
    const isAdmin = await authenticateAdmin(req);

    if (!isAdmin) {
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