import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { toNodeHandler } from "better-auth/node";

import { auth } from "./lib/auth.js";
import { adminSetupRoute } from "./routes/admin-setup.js";
import { adminSetupStatusRoute } from "./routes/admin-setup-status.js";
import { healthRoute } from "./routes/health.js";
import { meRoute } from "./routes/me.js";
import { providersRoute } from "./routes/providers.js";
import { activityLogsRoute } from "./routes/activity-logs.js";
import { notificationsRoute } from "./routes/notifications.js";
import { dashboardRoute } from "./routes/dashboard.js";
import { clinicalDashboardRoute } from "./routes/clinical-dashboard.js";
import { patientsRoute } from "./routes/patients.js";
import { medicationsRoute } from "./routes/medications.js";
import { adherenceRoute } from "./routes/adherence.js";
import { appointmentsRoute } from "./routes/appointments.js";
import { inventoryRoute } from "./routes/inventory.js";
import { messagesRoute } from "./routes/messages.js";
import { patientAuthRoute } from "./routes/patient-auth.js";
import { providerInviteAuthRoute } from "./routes/provider-invite-auth.js";
import { ocrRoute } from "./routes/ocr.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local .env files when present (no-op on Vercel where env vars are injected)
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

function normalizeOrigin(url?: string): string | null {
  const trimmed = (url || "").trim().replace(/\/+$/, "");
  return trimmed ? trimmed : null;
}

function getAllowedOrigins(): Set<string> {
  const envOrigins = [
    process.env.ADMIN_WEB_URL,
    process.env.HEALTHCARE_WEB_URL,
    process.env.PATIENT_WEB_URL,
    process.env.BETTER_AUTH_URL,
    ...(process.env.CORS_ALLOWED_ORIGINS || "").split(","),
  ]
    .map(normalizeOrigin)
    .filter((o): o is string => Boolean(o));

  return new Set([
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
    "http://localhost:8081",
    "http://localhost:19006",
    "https://pillpal-patient.vercel.app",
    "https://pillpal-healthcare.vercel.app",
    "https://pillpal-admin-web.vercel.app",
    "https://pillpal-api.vercel.app",
    ...envOrigins,
  ]);
}

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (getAllowedOrigins().has(normalized)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) return true;
  if (
    process.env.ALLOW_VERCEL_PREVIEWS === "true" &&
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(normalized)
  ) {
    return true;
  }
  return false;
}

const betterAuthHandler = toNodeHandler(auth);

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  } else if (!origin) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Idempotency-Key",
  );
  res.setHeader("Access-Control-Expose-Headers", "set-auth-token");

  // Handle browser CORS preflight requests.
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const rawUrl = req.url || "/";
  const parsedUrl = new URL(rawUrl, "http://localhost");
  const pathname = parsedUrl.pathname;

  try {
    // Redirect Better Auth fallback error page cleanly back to patient-web login
    if (req.method === "GET" && pathname.startsWith("/api/auth/error")) {
      const errCode = parsedUrl.searchParams.get("error") || "auth_error";
      const patientWebUrl =
        normalizeOrigin(process.env.PATIENT_WEB_URL) || "http://localhost:5175";
      res.writeHead(302, {
        Location: `${patientWebUrl}/auth/callback?error=${encodeURIComponent(errCode)}`,
      });
      res.end();
      return;
    }

    // Better Auth endpoints (/api/auth/*)
    if (pathname.startsWith("/api/auth")) {
      await betterAuthHandler(req, res);
      return;
    }

    if (req.method === "GET" && pathname === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "PILLPAL API is running" }));
      return;
    }

    if (req.method === "GET" && pathname === "/health") {
      healthRoute(req, res);
      return;
    }

    if (pathname === "/me" || pathname === "/me/profile") {
      await meRoute(req, res);
      return;
    }

    if (req.method === "GET" && pathname === "/setup/admin/status") {
      await adminSetupStatusRoute(req, res);
      return;
    }

    if (req.method === "POST" && pathname === "/setup/admin") {
      await adminSetupRoute(req, res);
      return;
    }

    if (pathname.startsWith("/dashboard")) {
      await dashboardRoute(req, res);
      return;
    }

    if (pathname.startsWith("/activity-logs")) {
      await activityLogsRoute(req, res);
      return;
    }

    if (pathname.startsWith("/notifications")) {
      await notificationsRoute(req, res);
      return;
    }

    if (pathname.startsWith("/clinical-dashboard")) {
      await clinicalDashboardRoute(req, res);
      return;
    }

    if (pathname.startsWith("/patients")) {
      await patientsRoute(req, res);
      return;
    }

    if (pathname.startsWith("/medications")) {
      await medicationsRoute(req, res);
      return;
    }

    if (pathname.startsWith("/adherence")) {
      await adherenceRoute(req, res);
      return;
    }

    if (pathname.startsWith("/appointments")) {
      await appointmentsRoute(req, res);
      return;
    }

    if (pathname.startsWith("/inventory")) {
      await inventoryRoute(req, res);
      return;
    }

    if (pathname.startsWith("/providers")) {
      await providersRoute(req, res);
      return;
    }

    if (pathname.startsWith("/messages")) {
      await messagesRoute(req, res);
      return;
    }

    if (pathname.startsWith("/auth/patient")) {
      await patientAuthRoute(req, res);
      return;
    }

    if (pathname.startsWith("/auth/provider")) {
      await providerInviteAuthRoute(req, res);
      return;
    }

    if (pathname.startsWith("/ocr")) {
      await ocrRoute(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Route not found" }));
  } catch (err: any) {
    console.error("[PILLPAL API] Unhandled request error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: err?.message || "Internal server error" }));
    }
  }
}
