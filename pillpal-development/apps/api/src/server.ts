import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

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
import { autoCancelOverdueAppointments } from "./services/appointments.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load apps/api/.env
dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

const PORT = 4000;
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
];

const server = createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );

  // Handle browser CORS preflight requests.
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        message: "PILLPAL API is running",
      }),
    );

    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    healthRoute(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/me") {
    void meRoute(req, res);
    return;
  }

  if (
    req.method === "GET" &&
    req.url === "/setup/admin/status"
  ) {
    void adminSetupStatusRoute(req, res);
    return;
  }

  if (
    req.method === "POST" &&
    req.url === "/setup/admin"
  ) {
    void adminSetupRoute(req, res);
    return;
  }

  if (req.url?.startsWith("/dashboard")) {
    void dashboardRoute(req, res);
    return;
  }

  if (req.url?.startsWith("/activity-logs")) {
    void activityLogsRoute(req, res);
    return;
  }

  if (req.url?.startsWith("/notifications")) {
    void notificationsRoute(req, res);
    return;
  }

  if (req.url?.startsWith("/clinical-dashboard")) {
    void clinicalDashboardRoute(req, res);
    return;
  }

  if (req.url?.startsWith("/patients")) {
    void patientsRoute(req, res);
    return;
  }

  if (req.url?.startsWith("/medications")) {
    void medicationsRoute(req, res);
    return;
  }

  if (req.url?.startsWith("/adherence")) {
    void adherenceRoute(req, res);
    return;
  }

  if (req.url?.startsWith("/appointments")) {
    void appointmentsRoute(req, res);
    return;
  }

  if (req.url?.startsWith("/inventory")) {
    void inventoryRoute(req, res);
    return;
  }

  if (req.url?.startsWith("/providers")) {
    void providersRoute(req, res);
    return;
  }

  if (req.url?.startsWith("/messages")) {
    void messagesRoute(req, res);
    return;
  }

  if (req.url?.startsWith("/auth/patient")) {
    void patientAuthRoute(req, res);
    return;
  }

  res.writeHead(404, {
    "Content-Type": "application/json",
  });

  res.end(
    JSON.stringify({
      message: "Route not found",
    }),
  );
});

server.listen(PORT, () => {
  console.log(
    `PILLPAL API running at http://localhost:${PORT}`,
  );

  // Initial overdue appointment check and ongoing 60-second periodic background check
  void autoCancelOverdueAppointments();
  setInterval(() => {
    void autoCancelOverdueAppointments();
  }, 60 * 1000);
});